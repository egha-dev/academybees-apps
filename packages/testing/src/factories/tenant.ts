import { hashPassword } from '@academybee/auth';
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

/** Password of every fixture user (tests only). */
export const FIXTURE_PASSWORD = 'Fixture#Pass2026';
let fixtureHash: Promise<string> | undefined;

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

export type TenantFixture = TenantSeed & {
  branchId: string;
  /** A member (role `owner`) of this academy only. */
  user: { id: string; email: string; membershipId: string; roleId: string };
  invitationId: string;
};

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
  const user = {
    id: newId(),
    email: `owner-${t.slug}@example.test`,
    membershipId: newId(),
    roleId: newId(),
  };
  const invitationId = newId();
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
    // Identity rows (C-59): a user may be created only for the identifier being looked up.
    await client.query(`SELECT set_config('app.lookup_identifier', $1, true)`, [user.email]);
    await client.query(
      `INSERT INTO "user" (id, email, name, updated_at) VALUES ($1, $2, $3, now())`,
      [user.id, user.email, `Owner of ${t.name}`],
    );
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [user.id]);
    await client.query(
      `INSERT INTO user_credential (user_id, password_hash, updated_at) VALUES ($1, $2, now())`,
      [user.id, await (fixtureHash ??= hashPassword(FIXTURE_PASSWORD))],
    );
    await client.query(
      `INSERT INTO membership (id, tenant_id, user_id, status, updated_at)
       VALUES ($1, $2, $3, 'ACTIVE', now())`,
      [user.membershipId, t.id, user.id],
    );
    await client.query(
      `INSERT INTO role (id, tenant_id, key, name, updated_at) VALUES ($1, $2, 'owner', 'Owner', now())`,
      [user.roleId, t.id],
    );
    await client.query(
      `INSERT INTO role_permission (tenant_id, role_id, capability, scope)
       VALUES ($1, $2, 'academy.settings.manage', 'TENANT'), ($1, $2, 'team.read', 'TENANT')`,
      [t.id, user.roleId],
    );
    await client.query(
      `INSERT INTO membership_role (tenant_id, membership_id, role_id) VALUES ($1, $2, $3)`,
      [t.id, user.membershipId, user.roleId],
    );
    await client.query(
      `INSERT INTO invitation (id, tenant_id, email, role_keys, token_hash, expires_at)
       VALUES ($1, $2, $3, '{teacher}', $4, now() + interval '7 days')`,
      [
        invitationId,
        t.id,
        `invitee-${t.slug}@example.test`,
        invitationId.replace(/-/g, '').padEnd(64, '0'),
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
  return { ...t, branchId, user, invitationId };
}
