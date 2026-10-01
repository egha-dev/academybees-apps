// Tenant-bound Prisma client (ADR-005, ARCHITECTURE §8.2).
//
// Every model operation runs in a transaction that first sets `app.tenant_id` (transaction-local,
// safe with PgBouncer transaction pooling), so PostgreSQL RLS sees only the current tenant's rows.
// On top of RLS, the client injects `tenantId` into filters and created rows and refuses a
// different tenantId, so application code never hand-writes it.
import { Prisma, type PrismaClient } from './generated/prisma/client.js';

/** Returns the tenant of the current request/job, or undefined outside a tenant context. */
export type TenantIdSource = () => string | undefined;

/** A tenant-owned table was used without a tenant context (fails closed). */
export class TenantContextMissingError extends Error {
  constructor(model: string, operation: string) {
    super(`Tenant context required for ${model}.${operation}`);
    this.name = 'TenantContextMissingError';
  }
}

/** Code tried to read or write another tenant's rows explicitly. */
export class TenantMismatchError extends Error {
  constructor(model: string, operation: string) {
    super(`tenantId does not match the current tenant in ${model}.${operation}`);
    this.name = 'TenantMismatchError';
  }
}

/** The client's interactive transaction is the only transaction form it supports. */
export class UnsupportedTransactionError extends Error {
  constructor() {
    super(
      'Batch $transaction([...]) is not supported on the tenant-bound client; use $transaction(async (tx) => …)',
    );
    this.name = 'UnsupportedTransactionError';
  }
}

type ModelKind = 'tenant-root' | 'tenant-owned' | 'platform-rows' | 'global';

/** Core tables that also hold platform/system rows with tenant_id NULL (C-53). */
const PLATFORM_ROW_MODELS = new Set([
  'AuditLog',
  'OutboxEvent',
  'IdempotencyRecord',
  'FeatureFlagOverride',
]);

/** How each Prisma model relates to tenants, derived from the generated client. */
export const MODEL_KINDS: Readonly<Record<string, ModelKind>> = Object.fromEntries(
  Object.values(Prisma.ModelName).map((model) => {
    const fields = (Prisma as unknown as Record<string, Record<string, string> | undefined>)[
      `${model}ScalarFieldEnum`
    ];
    let kind: ModelKind = 'global';
    if (model === 'Tenant') kind = 'tenant-root';
    else if (PLATFORM_ROW_MODELS.has(model)) kind = 'platform-rows';
    else if (fields && 'tenantId' in fields) kind = 'tenant-owned';
    return [model, kind];
  }),
);

/** Models whose rows belong to one tenant (every one is covered by the isolation suite). */
export const TENANT_OWNED_MODELS = Object.entries(MODEL_KINDS)
  .filter(([, kind]) => kind === 'tenant-owned')
  .map(([model]) => model);

type Args = Record<string, unknown>;

const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
]);

function scopeWhere(where: unknown, key: 'tenantId' | 'id', tenantId: string, fail: () => Error) {
  const w = (where ?? {}) as Args;
  if (key in w && w[key] !== tenantId) throw fail();
  return { ...w, [key]: tenantId };
}

function scopeData(data: unknown, tenantId: string, fail: () => Error): Args {
  const d = (data ?? {}) as Args;
  if ('tenant' in d) throw fail(); // relation writes would bypass the scalar check
  if ('tenantId' in d && d.tenantId !== tenantId) throw fail();
  return { ...d, tenantId };
}

/**
 * Rewrite operation arguments so they can only touch the current tenant's rows. Exported for unit
 * tests; RLS is the real boundary, this is the second layer.
 */
export function scopeArgs(model: string, operation: string, args: Args, tenantId: string): Args {
  const kind = MODEL_KINDS[model] ?? 'global';
  if (kind === 'global') return args;
  const fail = () => new TenantMismatchError(model, operation);
  const out: Args = { ...args };

  if (kind === 'tenant-root') {
    if (operation === 'create' || operation === 'createMany' || operation === 'createManyAndReturn')
      throw fail(); // tenants are provisioned by platform code only
    if (WHERE_OPERATIONS.has(operation)) out.where = scopeWhere(args.where, 'id', tenantId, fail);
    const data = args.data as Args | undefined;
    if (data && 'id' in data && data.id !== tenantId) throw fail();
    return out;
  }

  if (WHERE_OPERATIONS.has(operation))
    out.where = scopeWhere(args.where, 'tenantId', tenantId, fail);
  switch (operation) {
    case 'create':
      out.data = scopeData(args.data, tenantId, fail);
      break;
    case 'createMany':
    case 'createManyAndReturn': {
      const rows = Array.isArray(args.data) ? args.data : [args.data];
      out.data = rows.map((row) => scopeData(row, tenantId, fail));
      break;
    }
    case 'upsert':
      out.create = scopeData(args.create, tenantId, fail);
      if (args.update && 'tenantId' in (args.update as Args))
        out.update = scopeData(args.update, tenantId, fail);
      break;
    case 'update':
    case 'updateMany':
    case 'updateManyAndReturn': {
      const data = args.data as Args | undefined;
      if (data && ('tenantId' in data || 'tenant' in data))
        out.data = scopeData(data, tenantId, fail);
      break;
    }
    default:
      break;
  }
  return out;
}

function requireTenantFor(model: string, operation: string, tenantId: string | undefined) {
  const kind = MODEL_KINDS[model] ?? 'global';
  if (tenantId === undefined && (kind === 'tenant-owned' || kind === 'tenant-root'))
    throw new TenantContextMissingError(model, operation);
}

/** Client extension used inside interactive transactions: argument scoping only (RLS GUC is set once). */
function scopingExtension(getTenantId: TenantIdSource) {
  return Prisma.defineExtension({
    name: 'tenant-scoping',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          const tenantId = getTenantId();
          requireTenantFor(model, operation, tenantId);
          return query(tenantId ? scopeArgs(model, operation, args, tenantId) : args);
        },
      },
    },
  });
}

/**
 * Wrap the app client (`ab_app`) so that:
 * - model operations and raw queries run with `app.tenant_id` set for the current tenant;
 * - tenant-owned models are refused outside a tenant context (fail closed); platform-row core
 *   tables and global tables work without one (RLS then shows only NULL-tenant rows, C-53);
 * - `$transaction(async (tx) => …)` sets the context once and scopes every call inside it;
 *   the batch form `$transaction([...])` is rejected.
 */
export function createTenantBoundClient(base: PrismaClient, getTenantId: TenantIdSource) {
  const scoped = base.$extends(scopingExtension(getTenantId));

  const setTenant = (tenantId: string) =>
    base.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

  /** Raw SQL runs under the tenant context when there is one (RLS still applies without). */
  const runRaw = async ({
    args,
    query,
  }: {
    args: unknown;
    query: (args: unknown) => Prisma.PrismaPromise<unknown>;
  }): Promise<unknown> => {
    const tenantId = getTenantId();
    if (tenantId === undefined) return query(args);
    const [, result] = await base.$transaction([setTenant(tenantId), query(args)]);
    return result;
  };

  return base.$extends({
    name: 'tenant-bound',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const tenantId = getTenantId();
          requireTenantFor(model, operation, tenantId);
          if (tenantId === undefined) return query(args);
          const [, result] = await base.$transaction([
            setTenant(tenantId),
            query(scopeArgs(model, operation, args as Args, tenantId)),
          ]);
          return result;
        },
      },
      $queryRaw: runRaw,
      $executeRaw: runRaw,
      $queryRawUnsafe: runRaw,
      $executeRawUnsafe: runRaw,
    },
    client: {
      $transaction<R>(
        fn: (tx: Prisma.TransactionClient) => Promise<R>,
        options?: {
          isolationLevel?: Prisma.TransactionIsolationLevel;
          timeout?: number;
          maxWait?: number;
        },
      ): Promise<R> {
        if (typeof fn !== 'function') return Promise.reject(new UnsupportedTransactionError());
        const tenantId = getTenantId();
        return scoped.$transaction(async (tx) => {
          if (tenantId !== undefined)
            await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
          return fn(tx as unknown as Prisma.TransactionClient);
        }, options);
      },
    },
  });
}

export type TenantBoundClient = ReturnType<typeof createTenantBoundClient>;

export type ResolvedDomainRow = {
  tenantId: string;
  hostname: string;
  role: 'PRIMARY' | 'REDIRECT' | 'ALIAS';
  kind: 'SUBDOMAIN' | 'CUSTOM';
  verification: 'PENDING' | 'VERIFIED' | 'FAILED';
  tenant: {
    id: string;
    slug: string;
    status: 'PENDING_APPROVAL' | 'SETUP' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  };
};

/**
 * Find the domain row for one lookup key (subdomain label or custom host) before any tenant is
 * known, under the narrow host-lookup policy (C-51). Returns null for unknown hosts.
 */
export async function lookupTenantDomain(
  base: PrismaClient,
  lookupKey: string,
): Promise<ResolvedDomainRow | null> {
  const [, row] = await base.$transaction([
    base.$executeRaw`SELECT set_config('app.lookup_host', ${lookupKey}, true)`,
    base.tenantDomain.findUnique({
      where: { hostname: lookupKey },
      select: {
        tenantId: true,
        hostname: true,
        role: true,
        kind: true,
        verification: true,
        tenant: { select: { id: true, slug: true, status: true } },
      },
    }),
  ]);
  return row;
}
