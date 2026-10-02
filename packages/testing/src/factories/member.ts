import { hashPassword } from '@academybee/auth';
import { newId } from '@academybee/contracts';
import pg from 'pg';

import { FIXTURE_PASSWORD } from './tenant.js';

export type Grant = {
  capability: string;
  scope: 'TENANT' | 'BRANCH' | 'ASSIGNED' | 'LINKED' | 'SELF';
};

export type MemberFixture = { userId: string; email: string; membershipId: string };

let hash: Promise<string> | undefined;

/**
 * Add a signed-in-able member to an academy with one role made of the given grants (e.g. copied
 * from `ROLE_TEMPLATES.teacher.grants`). Password: FIXTURE_PASSWORD. Connect as the migrator.
 */
export async function addMemberFixture(
  connectionString: string,
  tenantId: string,
  input: { email: string; roleKey: string; grants: readonly Grant[]; branchIds?: string[] },
): Promise<MemberFixture> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  const member = { userId: newId(), email: input.email, membershipId: newId() };
  const roleId = newId();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('app.tenant_id', $1, true), set_config('app.lookup_identifier', $2, true), set_config('app.user_id', $3, true)`,
      [tenantId, input.email, member.userId],
    );
    await client.query(
      `INSERT INTO "user" (id, email, name, updated_at) VALUES ($1, $2, $3, now())`,
      [member.userId, input.email, `Member ${input.roleKey}`],
    );
    await client.query(
      `INSERT INTO user_credential (user_id, password_hash, updated_at) VALUES ($1, $2, now())`,
      [member.userId, await (hash ??= hashPassword(FIXTURE_PASSWORD))],
    );
    await client.query(
      `INSERT INTO membership (id, tenant_id, user_id, status, branch_ids, updated_at)
       VALUES ($1, $2, $3, 'ACTIVE', $4, now())`,
      [member.membershipId, tenantId, member.userId, input.branchIds ?? []],
    );
    await client.query(
      `INSERT INTO role (id, tenant_id, key, name, updated_at) VALUES ($1, $2, $3, $3, now())`,
      [roleId, tenantId, `${input.roleKey}-${member.userId.slice(-6)}`],
    );
    for (const g of input.grants)
      await client.query(
        `INSERT INTO role_permission (tenant_id, role_id, capability, scope) VALUES ($1, $2, $3, $4)`,
        [tenantId, roleId, g.capability, g.scope],
      );
    await client.query(
      `INSERT INTO membership_role (tenant_id, membership_id, role_id) VALUES ($1, $2, $3)`,
      [tenantId, member.membershipId, roleId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
  return member;
}
