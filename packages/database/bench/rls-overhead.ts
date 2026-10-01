// RLS + tenant-bound client overhead (ADR-005: budget < 2 ms p95 per simple query).
// `pnpm --filter @academybee/database bench` — starts its own Postgres (Testcontainers), loads two
// tenants with 5,000 branches each and compares the tenant-bound client (ab_app, RLS, driver-level
// BEGIN/set_config/COMMIT around each statement) with a plain client on a role that bypasses RLS
// (ab_platform, explicit tenant filter), for the same queries. Results go in the Phase 1 exit notes.
import { performance } from 'node:perf_hooks';

import { createTenantFixture, startPostgres } from '@academybee/testing';
import pg from 'pg';

import { createAppClient } from '../src/clients.js';
import { migrateAndApplySql } from '../src/migrate.js';
import { createTenantBoundClient } from '../src/tenant.js';

const ROWS_PER_TENANT = 5_000;
const WARMUP = 300;
const ITERATIONS = 3_000;

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? NaN;
}

async function measure(fn: () => Promise<unknown>) {
  for (let i = 0; i < WARMUP; i += 1) await fn();
  const samples: number[] = [];
  for (let i = 0; i < ITERATIONS; i += 1) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  samples.sort((x, y) => x - y);
  return { p50: percentile(samples, 50), p95: percentile(samples, 95) };
}

const pgc = await startPostgres({ migrate: migrateAndApplySql });
try {
  const [a, b] = [
    await createTenantFixture(pgc.urls.migrator),
    await createTenantFixture(pgc.urls.migrator),
  ];
  const su = new pg.Client({ connectionString: pgc.urls.superuser });
  await su.connect();
  for (const t of [a, b]) {
    await su.query(
      `INSERT INTO branch (id, tenant_id, name, updated_at)
       SELECT gen_random_uuid(), $1, 'Branch ' || g, now() FROM generate_series(1, $2) g`,
      [t.id, ROWS_PER_TENANT],
    );
  }
  await su.query('ANALYZE');
  await su.end();

  // Baseline: same Prisma stack, role that bypasses RLS (ab_platform), explicit tenant filter.
  const plain = createAppClient(pgc.urls.platform, { maxConnections: 5 });
  const bound = createTenantBoundClient(pgc.urls.app, () => a.id, { maxConnections: 5 });

  const cases = {
    'findUnique by id': {
      baseline: () => plain.branch.findFirst({ where: { id: a.branchId, tenantId: a.id } }),
      bound: () => bound.branch.findUnique({ where: { id: a.branchId } }),
    },
    'findMany page of 20': {
      baseline: () =>
        plain.branch.findMany({ where: { tenantId: a.id }, orderBy: { id: 'asc' }, take: 20 }),
      bound: () => bound.branch.findMany({ orderBy: { id: 'asc' }, take: 20 }),
    },
    count: {
      baseline: () => plain.branch.count({ where: { tenantId: a.id } }),
      bound: () => bound.branch.count(),
    },
  };

  const results: Record<string, unknown> = {};
  for (const [name, c] of Object.entries(cases)) {
    const baseline = await measure(c.baseline);
    const withRls = await measure(c.bound);
    results[name] = {
      baselineP50: +baseline.p50.toFixed(3),
      baselineP95: +baseline.p95.toFixed(3),
      boundP50: +withRls.p50.toFixed(3),
      boundP95: +withRls.p95.toFixed(3),
      overheadP95Ms: +(withRls.p95 - baseline.p95).toFixed(3),
    };
  }
  console.warn(
    JSON.stringify({ rowsPerTenant: ROWS_PER_TENANT, iterations: ITERATIONS, results }, null, 2),
  );
  await Promise.all([plain.$disconnect(), bound.$disconnect()]);
} finally {
  await pgc.stop();
}
