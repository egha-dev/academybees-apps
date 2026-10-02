// Tenant-bound Prisma client (ADR-005, ARCHITECTURE §8.2).
//
// The pg driver adapter sets `app.tenant_id` (transaction-local, safe with PgBouncer transaction
// pooling) for everything the client sends, so PostgreSQL RLS sees only the current tenant's rows.
// On top of RLS, the client injects `tenantId` into filters and created rows and refuses a
// different tenantId, so application code never hand-writes it. Setting the context in the driver
// instead of a Prisma batch transaction per query keeps the overhead to raw round trips (Phase 1
// benchmark, ADR-005).
import { PrismaPg } from '@prisma/adapter-pg';
import type {
  IsolationLevel,
  SqlDriverAdapter,
  SqlDriverAdapterFactory,
  SqlQuery,
  Transaction,
} from '@prisma/driver-adapter-utils';

import { type DatabaseClientOptions } from './clients.js';
import { Prisma, PrismaClient } from './generated/prisma/client.js';

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

type ModelKind = 'tenant-root' | 'tenant-owned' | 'platform-rows' | 'user-owned' | 'global';

/** Core tables that also hold platform/system rows with tenant_id NULL (C-53). */
const PLATFORM_ROW_MODELS = new Set([
  'AuditLog',
  'OutboxEvent',
  'IdempotencyRecord',
  'FeatureFlagOverride',
]);

/**
 * Identity models protected by user-bound RLS (`app.user_id`, C-59), not by tenant context.
 * `AuthSession` has a nullable tenant_id (TENANT sessions only) but is user-owned.
 */
export const USER_OWNED_MODELS: ReadonlySet<string> = new Set([
  'User',
  'UserCredential',
  'AuthSession',
  'PasswordResetToken',
  'MfaFactor',
  'MfaRecoveryCode',
  'KnownDevice',
  'PlatformStaff',
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
    else if (USER_OWNED_MODELS.has(model)) kind = 'user-owned';
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

/**
 * `findUnique` arguments → equivalent `findFirst` arguments: compound unique selectors
 * (`scope_key: { scope, key }`, Prisma joins field names with `_`) become plain field filters.
 */
export function uniqueToFirstArgs(args: unknown): Args {
  const a = { ...((args ?? {}) as Args) };
  const where = (a.where ?? {}) as Args;
  const flat: Args = {};
  for (const [key, value] of Object.entries(where)) {
    const compound =
      key.includes('_') && value !== null && typeof value === 'object' && !Array.isArray(value);
    if (compound) Object.assign(flat, value);
    else flat[key] = value;
  }
  a.where = flat;
  return a;
}

/** Statements the driver runs around a tenant-scoped query (ADR-005). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATEMENT = (sql: string): SqlQuery => ({ sql, args: [], argTypes: [] });

function setTenantQuery(tenantId: string): SqlQuery {
  if (!UUID.test(tenantId)) throw new Error('Tenant context is not a UUID');
  return {
    sql: `SELECT set_config('app.tenant_id', $1, true)`,
    args: [tenantId],
    argTypes: [{ scalarType: 'string', arity: 'scalar' }],
  };
}

/**
 * Driver-level tenant context. Every statement Prisma sends outside a transaction runs as
 * BEGIN → set_config('app.tenant_id', …, true) → statement → COMMIT on one pooled connection, and
 * every transaction Prisma starts sets the context right after BEGIN. Transaction-local, so it is
 * safe with PgBouncer transaction pooling and a reused connection never carries a tenant.
 * Without a tenant context statements run unchanged (RLS then shows no tenant rows).
 */
function tenantScopedAdapter(
  adapter: SqlDriverAdapter,
  getTenantId: TenantIdSource,
): SqlDriverAdapter {
  const inTenant = async <T>(
    tenantId: string,
    run: (tx: Transaction) => Promise<T>,
  ): Promise<T> => {
    const tx = await adapter.startTransaction();
    try {
      await tx.executeRaw(setTenantQuery(tenantId));
      const result = await run(tx);
      await tx.executeRaw(STATEMENT('COMMIT'));
      await tx.commit();
      return result;
    } catch (error) {
      await tx.executeRaw(STATEMENT('ROLLBACK')).catch(() => undefined);
      await tx.rollback();
      throw error;
    }
  };

  return new Proxy(adapter, {
    get(target, prop, receiver) {
      switch (prop) {
        case 'queryRaw':
          return (query: SqlQuery) => {
            const tenantId = getTenantId();
            return tenantId === undefined
              ? target.queryRaw(query)
              : inTenant(tenantId, (tx) => tx.queryRaw(query));
          };
        case 'executeRaw':
          return (query: SqlQuery) => {
            const tenantId = getTenantId();
            return tenantId === undefined
              ? target.executeRaw(query)
              : inTenant(tenantId, (tx) => tx.executeRaw(query));
          };
        case 'startTransaction':
          return async (isolationLevel?: IsolationLevel) => {
            const tenantId = getTenantId();
            const tx = await target.startTransaction(isolationLevel);
            if (tenantId !== undefined) {
              try {
                await tx.executeRaw(setTenantQuery(tenantId));
              } catch (error) {
                await tx.executeRaw(STATEMENT('ROLLBACK')).catch(() => undefined);
                await tx.rollback();
                throw error;
              }
            }
            return tx;
          };
        case 'executeScript':
          return () =>
            Promise.reject(new Error('executeScript is not available on the tenant-bound client'));
        default: {
          const value: unknown = Reflect.get(target, prop, receiver);
          return typeof value === 'function'
            ? (value as (...a: unknown[]) => unknown).bind(target)
            : value;
        }
      }
    },
  });
}

function tenantScopedAdapterFactory(
  factory: SqlDriverAdapterFactory,
  getTenantId: TenantIdSource,
): SqlDriverAdapterFactory {
  return new Proxy(factory, {
    get(target, prop, receiver) {
      if (prop === 'connect')
        return async () => tenantScopedAdapter(await target.connect(), getTenantId);
      const value: unknown = Reflect.get(target, prop, receiver);
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

/**
 * The application database client (`ab_app`, ADR-005):
 * - the driver sets `app.tenant_id` for every statement and transaction (see above), so RLS sees
 *   only the current tenant's rows — model operations, raw SQL, batch and interactive transactions;
 * - the client also scopes arguments: `tenantId` is injected into filters and created rows and a
 *   different tenantId is refused;
 * - tenant-owned models are refused outside a tenant context (fail closed); platform-row core
 *   tables and global tables work without one (RLS then shows only NULL-tenant rows, C-53).
 */
export function createTenantBoundClient(
  url: string,
  getTenantId: TenantIdSource,
  options: DatabaseClientOptions = {},
): TenantBoundClient {
  const adapter = new PrismaPg({ connectionString: url, max: options.maxConnections ?? 10 });
  const base = new PrismaClient({
    adapter: tenantScopedAdapterFactory(adapter, getTenantId),
    log: options.log ?? [],
  });
  const bound = base.$extends({
    name: 'tenant-bound',
    model: {
      // Prisma batches findUnique calls made in the same tick into one query, which would run
      // under only one caller's tenant context (the others would get null). findFirst is never
      // batched; with a unique filter it returns the same row.
      $allModels: {
        findUnique<T, A>(this: T, args: Prisma.Exact<A, Prisma.Args<T, 'findUnique'>>) {
          const ctx = Prisma.getExtensionContext(this) as unknown as {
            findFirst: (a: unknown) => Prisma.PrismaPromise<Prisma.Result<T, A, 'findUnique'>>;
          };
          return ctx.findFirst(uniqueToFirstArgs(args));
        },
        findUniqueOrThrow<T, A>(
          this: T,
          args: Prisma.Exact<A, Prisma.Args<T, 'findUniqueOrThrow'>>,
        ) {
          const ctx = Prisma.getExtensionContext(this) as unknown as {
            findFirstOrThrow: (
              a: unknown,
            ) => Prisma.PrismaPromise<Prisma.Result<T, A, 'findUniqueOrThrow'>>;
          };
          return ctx.findFirstOrThrow(uniqueToFirstArgs(args));
        },
      },
    },
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          const tenantId = getTenantId();
          requireTenantFor(model, operation, tenantId);
          return query(tenantId === undefined ? args : scopeArgs(model, operation, args, tenantId));
        },
      },
    },
    client: {
      /**
       * Find the domain row for one lookup key (subdomain label or custom host) before any tenant
       * is known, under the narrow host-lookup policy (C-51). Null for unknown hosts.
       */
      async $lookupTenantDomain(lookupKey: string): Promise<ResolvedDomainRow | null> {
        if (getTenantId() !== undefined)
          throw new Error('Host lookup runs before a tenant context exists');
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
      },
    },
  });
  return bound as unknown as TenantBoundClient;
}

/**
 * The extensions change behaviour, not signatures, so the client is typed as a PrismaClient (its
 * transactions are ordinary `Prisma.TransactionClient`s) plus the host lookup.
 */
export type TenantBoundClient = PrismaClient & {
  $lookupTenantDomain(lookupKey: string): Promise<ResolvedDomainRow | null>;
};

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
