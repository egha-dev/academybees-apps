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

/**
 * Identity tables (C-59): protected by user-bound RLS instead of the tenant policy. `auth_session`
 * has a nullable tenant_id (TENANT sessions only) but is user-owned.
 */
const IDENTITY_POLICIES: Record<string, string[]> = {
  user: ['user_insert', 'user_select', 'user_update'],
  user_credential: ['user_isolation'],
  mfa_factor: ['user_isolation'],
  mfa_recovery_code: ['user_isolation'],
  known_device: ['user_isolation'],
  platform_staff: ['user_isolation'],
  password_reset_token: ['token_lookup', 'user_isolation'],
  auth_session: ['token_lookup', 'user_isolation'],
  otp_challenge: ['identifier_lookup'],
};

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
      (t) =>
        !t.rls ||
        !t.forced ||
        (!t.policies.includes('tenant_isolation') && !(t.table_name in IDENTITY_POLICIES)),
    );
    expect(unprotected.map((t) => t.table_name)).toEqual([]);
  });

  it('nullable tenant_id only on the platform-row core tables (C-53)', async () => {
    const nullable = (await tenantTables())
      .filter((t) => t.is_nullable === 'YES')
      .map((t) => t.table_name);
    expect(nullable.sort()).toEqual([...PLATFORM_ROW_TABLES, 'auth_session'].sort());
  });

  it('every identity table is FORCE-protected by its user-bound policies (C-59)', async () => {
    const { rows } = await db.query<{ relname: string; rls: boolean; forced: boolean }>(
      `SELECT relname, relrowsecurity AS rls, relforcerowsecurity AS forced FROM pg_class
        WHERE relname = ANY($1) AND relkind = 'r'`,
      [Object.keys(IDENTITY_POLICIES)],
    );
    expect(rows.map((r) => r.relname).sort()).toEqual(Object.keys(IDENTITY_POLICIES).sort());
    expect(rows.filter((r) => !r.rls || !r.forced)).toEqual([]);
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

  it('every table has exactly the expected policies, all keyed on tenant/user/lookup context (review L5)', async () => {
    const { rows } = await db.query<{
      tablename: string;
      policyname: string;
      cmd: string;
      qual: string | null;
      with_check: string | null;
    }>(
      `SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
        WHERE schemaname = 'public' ORDER BY tablename, policyname`,
    );
    const byTable = new Map<string, string[]>();
    for (const r of rows)
      byTable.set(r.tablename, [...(byTable.get(r.tablename) ?? []), r.policyname]);
    const tables = [
      ...new Set([
        ...(await tenantTables()).map((t) => t.table_name),
        ...Object.keys(IDENTITY_POLICIES),
      ]),
    ];
    const SPECIAL: Record<string, string[]> = {
      ...IDENTITY_POLICIES,
      tenant_domain: ['host_lookup', 'tenant_isolation'],
      audit_log: ['platform_insert', 'tenant_isolation'],
      membership: ['own_memberships', 'tenant_isolation'],
      invitation: ['tenant_isolation', 'token_lookup'],
    };
    for (const table of tables)
      expect(byTable.get(table), table).toEqual(SPECIAL[table] ?? ['tenant_isolation']);
    expect(byTable.get('tenant')).toEqual(['host_lookup', 'tenant_isolation']);
    // No permissive "allow everything" policy can hide among them.
    for (const r of rows) {
      const text = `${r.qual ?? ''} ${r.with_check ?? ''}`;
      expect(text, `${r.tablename}.${r.policyname}`).toMatch(
        /ab_current_tenant\(\)|ab_lookup_host\(\)|ab_current_user\(\)|ab_lookup_identifier\(\)|ab_lookup_token\(\)/,
      );
      expect(text, `${r.tablename}.${r.policyname}`).not.toMatch(/^\s*true\s*$|\(true\)/);
    }
    // Host lookup and the audit platform insert are narrower than "all commands".
    for (const r of rows.filter((x) => x.policyname === 'host_lookup'))
      expect(r.cmd).toBe('SELECT');
    for (const r of rows.filter((x) => x.policyname === 'platform_insert'))
      expect(r.cmd).toBe('INSERT');
    // Lookups and the Family Hub membership listing only read.
    for (const r of rows.filter((x) =>
      ['token_lookup', 'own_memberships', 'user_select'].includes(x.policyname),
    ))
      expect(r.cmd, `${r.tablename}.${r.policyname}`).toBe('SELECT');
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
