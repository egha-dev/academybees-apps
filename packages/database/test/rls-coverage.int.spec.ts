import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

/**
 * Every table with a tenant_id column is protected by FORCEd RLS with a tenant_isolation policy
 * (ADR-005). 010-tenant-rls.sql applies it automatically; this test fails if a table slips through
 * or a policy is dropped. Nullable tenant_id is allowed only on the core tables that also hold
 * platform rows (C-53).
 */
const PLATFORM_ROW_TABLES = [
  'audit_log',
  'feature_flag_override',
  'idempotency_record',
  'outbox_event',
];

const urls = inject('databaseUrls');

describe('RLS coverage (ADR-005)', () => {
  let db: pg.Client;

  beforeAll(async () => {
    db = new pg.Client({ connectionString: urls.superuser });
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  async function tenantTables() {
    const { rows } = await db.query<{
      table_name: string;
      is_nullable: 'YES' | 'NO';
      rls: boolean;
      forced: boolean;
      policies: string[];
    }>(`
      SELECT c.table_name, c.is_nullable,
             cl.relrowsecurity AS rls, cl.relforcerowsecurity AS forced,
             COALESCE(array_agg(p.policyname) FILTER (WHERE p.policyname IS NOT NULL), '{}') AS policies
        FROM information_schema.columns c
        JOIN pg_class cl ON cl.relname = c.table_name AND cl.relkind = 'r'
        JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = c.table_schema
        LEFT JOIN pg_policies p ON p.tablename = c.table_name AND p.schemaname = c.table_schema
       WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
       GROUP BY c.table_name, c.is_nullable, cl.relrowsecurity, cl.relforcerowsecurity
       ORDER BY c.table_name`);
    return rows;
  }

  it('finds the tenant tables', async () => {
    const names = (await tenantTables()).map((t) => t.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        'branch',
        'tenant_branding',
        'tenant_domain',
        'tenant_settings',
        ...PLATFORM_ROW_TABLES,
      ]),
    );
  });

  it('every table with tenant_id has ENABLE + FORCE RLS and a tenant_isolation policy', async () => {
    const unprotected = (await tenantTables()).filter(
      (t) => !t.rls || !t.forced || !t.policies.includes('tenant_isolation'),
    );
    expect(unprotected.map((t) => t.table_name)).toEqual([]);
  });

  it('nullable tenant_id only on the platform-row core tables (C-53)', async () => {
    const nullable = (await tenantTables())
      .filter((t) => t.is_nullable === 'YES')
      .map((t) => t.table_name);
    expect(nullable.sort()).toEqual([...PLATFORM_ROW_TABLES].sort());
  });

  it('the tenant table itself is protected and keyed on id', async () => {
    const { rows } = await db.query<{ forced: boolean; qual: string }>(`
      SELECT cl.relforcerowsecurity AS forced, p.qual
        FROM pg_class cl JOIN pg_policies p ON p.tablename = cl.relname
       WHERE cl.relname = 'tenant' AND p.policyname = 'tenant_isolation'`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.forced).toBe(true);
    expect(rows[0]?.qual).toContain('ab_current_tenant()');
  });

  it('the application role cannot bypass RLS', async () => {
    const { rows } = await db.query(
      `SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('ab_app', 'ab_migrator') ORDER BY rolname`,
    );
    expect(rows).toEqual([
      { rolname: 'ab_app', rolbypassrls: false },
      { rolname: 'ab_migrator', rolbypassrls: false },
    ]);
  });
});
