import { PrismaPg } from '@prisma/adapter-pg';

import { type Prisma, PrismaClient } from './generated/prisma/client.js';

export type DatabaseClientOptions = {
  /** Max pooled connections for this process (pg pool). */
  maxConnections?: number;
  /** Log slow queries etc. through the app logger in later phases; off by default. */
  log?: Prisma.LogLevel[];
};

function create(connectionString: string, options: DatabaseClientOptions = {}): PrismaClient {
  const adapter = new PrismaPg({
    connectionString,
    max: options.maxConnections ?? 10,
  });
  return new PrismaClient({ adapter, log: options.log ?? [] });
}

/**
 * Client for application code, connected as `ab_app` (NO BYPASSRLS, ADR-005).
 * Phase 1 wraps it in the tenant-bound extension (`set_config('app.tenant_id', …)` + tenantId
 * injection); code must never use a raw app client for tenant-owned tables after that.
 */
export function createAppClient(url: string, options?: DatabaseClientOptions): PrismaClient {
  return create(url, options);
}

/** Schema-owner client (`ab_migrator`) for migrations, grants and dev seeds only. */
export function createMigratorClient(url: string, options?: DatabaseClientOptions): PrismaClient {
  return create(url, { maxConnections: 2, ...options });
}

export type TransactionClient = Prisma.TransactionClient;

/**
 * Run `fn` in one database transaction (multi-record invariants, outbox rows with their change).
 * Defaults to READ COMMITTED; pass `Serializable` where the invariant needs it.
 */
export function withTransaction<T>(
  client: PrismaClient,
  fn: (tx: TransactionClient) => Promise<T>,
  options: { isolationLevel?: Prisma.TransactionIsolationLevel; timeoutMs?: number } = {},
): Promise<T> {
  return client.$transaction(fn, {
    ...(options.isolationLevel ? { isolationLevel: options.isolationLevel } : {}),
    timeout: options.timeoutMs ?? 10_000,
  });
}
