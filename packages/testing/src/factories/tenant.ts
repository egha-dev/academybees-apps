import { newId } from '@academybee/contracts';
import pg from 'pg';

import { defineFactory } from './index.js';

export type TenantSeed = {
  id: string;
  slug: string;
  name: string;
  academyType: string;
  status: 'PENDING_APPROVAL' | 'SETUP' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  primaryColor: string;
};

let counter = 0;

export const buildTenant = defineFactory<TenantSeed>(() => {
  counter += 1;
  const id = newId();
  return {
    id,
    // Unique and slug-shaped across parallel test files.
    slug: `t${id.slice(-8)}-${counter}`,
    name: `Test Academy ${counter}`,
    academyType: 'tuition',
    status: 'ACTIVE',
    primaryColor: '#1F6F5C',
  };
});

export type TenantFixture = TenantSeed & { branchId: string };

/**
 * Insert a tenant with its PRIMARY subdomain, branding, settings and default branch, the way
 * provisioning will (Phase 3). Pass a connection that may write tenant rows — the migrator (FORCE
 * RLS applies, so the context is set per transaction) or the superuser.
 */
export async function createTenantFixture(
  connectionString: string,
  overrides: Partial<TenantSeed> = {},
): Promise<TenantFixture> {
  const t = buildTenant(overrides);
  const branchId = newId();
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [t.id]);
    await client.query(
      `INSERT INTO tenant (id, slug, name, academy_type, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [t.id, t.slug, t.name, t.academyType, t.status],
    );
    await client.query(
      `INSERT INTO tenant_domain (id, tenant_id, hostname, kind, role, verification, verified_at, updated_at)
       VALUES ($1, $2, $3, 'SUBDOMAIN', 'PRIMARY', 'VERIFIED', now(), now())`,
      [newId(), t.id, t.slug],
    );
    await client.query(
      `INSERT INTO tenant_branding (tenant_id, display_name, primary_color, updated_at)
       VALUES ($1, $2, $3, now())`,
      [t.id, t.name, t.primaryColor],
    );
    await client.query(`INSERT INTO tenant_settings (tenant_id, updated_at) VALUES ($1, now())`, [
      t.id,
    ]);
    await client.query(
      `INSERT INTO branch (id, tenant_id, name, is_default, updated_at)
       VALUES ($1, $2, 'Main branch', true, now())`,
      [branchId, t.id],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
  return { ...t, branchId };
}
