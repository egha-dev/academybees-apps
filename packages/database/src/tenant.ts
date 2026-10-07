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
/** Returns the signed-in (or flow-resolved) user, or undefined (C-59). */
export type UserIdSource = () => string | undefined;

/**
 * The idempotency claim the current request holds (review M1): its record id, the attempt it owns
 * (bumped when a stale claim is taken over) and the record's tenant.
 */
export type IdempotencyClaimRef = { id: string; attempt: number; tenantId: string | undefined };
/** Returns the claim of the current request, if it holds one. */
export type IdempotencyClaimSource = () => IdempotencyClaimRef | undefined;

type DbContext = {
  tenantId: string | undefined;
  userId: string | undefined;
  claim?: IdempotencyClaimRef | undefined;
};

/** A tenant-owned table was used without a tenant context (fails closed). */
export class TenantContextMissingError extends Error {
  constructor(model: string, operation: string) {
    super(`Tenant context required for ${model}.${operation}`);
    this.name = 'TenantContextMissingError';
  }
}

/**
 * The request's idempotency claim was taken over by a retry after its lease ran out, so this
 * request may no longer commit: its transaction is rolled back (review M1, fencing).
 */
export class IdempotencyClaimLostError extends Error {
  constructor() {
    super('idempotency claim lost: a retry took over this key');
    this.name = 'IdempotencyClaimLostError';
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
  // Identity rows are protected by user-bound RLS, not tenant scoping (C-59).
  if (kind === 'global' || kind === 'user-owned') return args;
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

/** One statement sets both GUCs (an unset one becomes '', which policies read as NULL). */
function setContextQuery({ tenantId, userId }: DbContext): SqlQuery {
  if (tenantId !== undefined && !UUID.test(tenantId))
    throw new Error('Tenant context is not a UUID');
  if (userId !== undefined && !UUID.test(userId)) throw new Error('User context is not a UUID');
  return {
    sql: `SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)`,
    args: [tenantId ?? '', userId ?? ''],
    argTypes: [
      { scalarType: 'string', arity: 'scalar' },
      { scalarType: 'string', arity: 'scalar' },
    ],
  };
}

const hasContext = (ctx: DbContext) =>
  ctx.tenantId !== undefined || ctx.userId !== undefined || ctx.claim !== undefined;

const isCommit = (query: SqlQuery) => query.sql.trim().toUpperCase() === 'COMMIT';

/**
 * Runs inside every transaction of a request that holds an idempotency claim, right before its
 * COMMIT (review M1). If the transaction wrote anything, it records that the request committed
 * something — atomically with the side effect — so a stale claim is taken over only when nothing
 * was ever committed. It also fences:
 * when a retry has taken the claim over, the UPDATE matches no row and this transaction is rolled
 * back, so two attempts can never both commit. The record's own tenant is set first because the
 * statement must see the row whatever context the transaction ran in (the GUC is transaction-local
 * and the transaction ends right after).
 */
async function markClaimCommitted(tx: Transaction, claim: IdempotencyClaimRef): Promise<void> {
  if (claim.tenantId !== undefined && !UUID.test(claim.tenantId))
    throw new Error('Claim tenant is not a UUID');
  if (!UUID.test(claim.id)) throw new Error('Claim id is not a UUID');
  // Only a transaction that wrote something commits a side effect. PostgreSQL assigns a
  // transaction id on the first write, so a read-only transaction (a lookup before a validation
  // error) leaves the claim releasable: the client can retry with the same key (review M2).
  const wrote = await tx.queryRaw(STATEMENT('SELECT txid_current_if_assigned() IS NOT NULL'));
  if (wrote.rows[0]?.[0] !== true) return;
  await tx.executeRaw({
    sql: `SELECT set_config('app.tenant_id', $1, true)`,
    args: [claim.tenantId ?? ''],
    argTypes: [{ scalarType: 'string', arity: 'scalar' }],
  });
  const marked = await tx.queryRaw({
    sql: `UPDATE idempotency_record SET committed_at = COALESCE(committed_at, now())
           WHERE id = $1::uuid AND attempt = $2 AND status = 'IN_PROGRESS' RETURNING id`,
    args: [claim.id, claim.attempt],
    argTypes: [
      { scalarType: 'string', arity: 'scalar' },
      { scalarType: 'int', arity: 'scalar' },
    ],
  });
  if (marked.rows.length !== 1) throw new IdempotencyClaimLostError();
}

/** A transaction whose COMMIT first marks the request's idempotency claim. */
function withClaimMarker(tx: Transaction, claim: IdempotencyClaimRef): Transaction {
  return new Proxy(tx, {
    get(target, prop, receiver) {
      if (prop === 'executeRaw')
        return async (query: SqlQuery) => {
          if (isCommit(query)) {
            try {
              await markClaimCommitted(target, claim);
            } catch (error) {
              // Prisma's rollback() only returns the connection to the pool; without an explicit
              // ROLLBACK the open transaction would be committed by the connection's next user.
              await target.executeRaw(STATEMENT('ROLLBACK')).catch(() => undefined);
              throw error;
            }
          }
          return target.executeRaw(query);
        };
      const value: unknown = Reflect.get(target, prop, receiver);
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

/**
 * Driver-level context. Every statement Prisma sends outside a transaction runs as
 * BEGIN → set_config('app.tenant_id' / 'app.user_id', …, true) → statement → COMMIT on one pooled
 * connection, and every transaction Prisma starts sets the context right after BEGIN.
 * Transaction-local, so it is safe with PgBouncer transaction pooling and a reused connection never
 * carries a tenant or user. Without any context statements run unchanged (RLS then shows nothing).
 */
function tenantScopedAdapter(
  adapter: SqlDriverAdapter,
  getContext: () => DbContext,
): SqlDriverAdapter {
  const inContext = async <T>(ctx: DbContext, run: (tx: Transaction) => Promise<T>): Promise<T> => {
    const tx = await adapter.startTransaction();
    try {
      if (ctx.tenantId !== undefined || ctx.userId !== undefined)
        await tx.executeRaw(setContextQuery(ctx));
      const result = await run(tx);
      if (ctx.claim) await markClaimCommitted(tx, ctx.claim);
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
            const ctx = getContext();
            return hasContext(ctx)
              ? inContext(ctx, (tx) => tx.queryRaw(query))
              : target.queryRaw(query);
          };
        case 'executeRaw':
          return (query: SqlQuery) => {
            const ctx = getContext();
            return hasContext(ctx)
              ? inContext(ctx, (tx) => tx.executeRaw(query))
              : target.executeRaw(query);
          };
        case 'startTransaction':
          return async (isolationLevel?: IsolationLevel) => {
            const ctx = getContext();
            const tx = await target.startTransaction(isolationLevel);
            if (ctx.tenantId !== undefined || ctx.userId !== undefined) {
              try {
                await tx.executeRaw(setContextQuery(ctx));
              } catch (error) {
                await tx.executeRaw(STATEMENT('ROLLBACK')).catch(() => undefined);
                await tx.rollback();
                throw error;
              }
            }
            return ctx.claim ? withClaimMarker(tx, ctx.claim) : tx;
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
  getContext: () => DbContext,
): SqlDriverAdapterFactory {
  return new Proxy(factory, {
    get(target, prop, receiver) {
      if (prop === 'connect')
        return async () => tenantScopedAdapter(await target.connect(), getContext);
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
  options: DatabaseClientOptions & {
    getUserId?: UserIdSource;
    getIdempotencyClaim?: IdempotencyClaimSource;
  } = {},
): TenantBoundClient {
  const getUserId = options.getUserId ?? (() => undefined);
  const getClaim = options.getIdempotencyClaim ?? (() => undefined);
  const adapter = new PrismaPg({ connectionString: url, max: options.maxConnections ?? 10 });
  const base = new PrismaClient({
    adapter: tenantScopedAdapterFactory(adapter, () => ({
      tenantId: getTenantId(),
      userId: getUserId(),
      claim: getClaim(),
    })),
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
       * Run `fn` in one transaction that may read the single identity row matching a value the
       * caller already holds (C-59): `identifier` (normalised email/phone) or `token` (SHA-256 of a
       * refresh/reset/invite secret). The current academy/user context still applies.
       */
      async $withLookup<T>(
        lookup: { identifier?: string; token?: string },
        fn: (tx: Prisma.TransactionClient) => Promise<T>,
      ): Promise<T> {
        const client = Prisma.getExtensionContext(this) as unknown as PrismaClient;
        return client.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.lookup_identifier', ${lookup.identifier ?? ''}, true), set_config('app.lookup_token', ${lookup.token ?? ''}, true)`;
          return fn(tx);
        });
      },
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
      /**
       * The current user's own ACTIVE memberships, outside any academy context — the first step of
       * the Family Hub fan-out (ADR-039). RLS `own_memberships` shows only rows whose user_id is
       * `app.user_id` and only while no tenant is set; each academy is then read in its own context.
       */
      async $listOwnMemberships(): Promise<{ tenantId: string }[]> {
        if (getTenantId() !== undefined)
          throw new Error('Own memberships are listed outside an academy context');
        if (getUserId() === undefined) throw new Error('Own memberships need a user context');
        return base.membership.findMany({
          where: { status: 'ACTIVE' },
          select: { tenantId: true },
          orderBy: { createdAt: 'asc' },
        });
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
  $listOwnMemberships(): Promise<{ tenantId: string }[]>;
  $withLookup<T>(
    lookup: { identifier?: string; token?: string },
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T>;
};

/**
 * Pin a user resolved during a flow (login, refresh, reset) for the rest of the transaction, so
 * its user-owned rows become visible and writable (C-59). Clears the lookup GUCs.
 */
export async function bindUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  if (!UUID.test(userId)) throw new Error('User id is not a UUID');
  await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true), set_config('app.lookup_identifier', '', true), set_config('app.lookup_token', '', true)`;
}

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
