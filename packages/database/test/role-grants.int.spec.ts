import { createTenantFixture, type TenantFixture } from '@academybee/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { syncSystemRoleGrants, systemRoleGrantRows } from '../src/reference.js';

const urls = inject('databaseUrls');

async function connect(url: string) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

/** Reads one academy's rows as the superuser (RLS doesn't apply). */
async function asSuperuser<T>(fn: (su: pg.Client) => Promise<T>): Promise<T> {
  const su = await connect(urls.superuser);
  try {
    return await fn(su);
  } finally {
    await su.end();
  }
}

describe('system role grants reach existing academies (C-104)', () => {
  let academy: TenantFixture;
  let migrator: pg.Client;

  beforeAll(async () => {
    academy = await createTenantFixture(urls.migrator);
    migrator = await connect(urls.migrator);
  });

  afterAll(async () => {
    await migrator.end();
  });

  it('adds a template grant the academy is missing, keeps its own grants, refreshes members', async () => {
    // As if the academy was created before `student.health.read` existed, and had granted its
    // teachers cash recording itself (grantable, ARCHITECTURE §7.3).
    const before = await asSuperuser(async (su) => {
      await su.query(
        `DELETE FROM role_permission WHERE role_id = $1 AND capability = 'student.health.read'`,
        [academy.roleIds.owner],
      );
      await su.query(
        `INSERT INTO role_permission (tenant_id, role_id, capability, scope)
         VALUES ($1, $2, 'payment.record_cash', 'ASSIGNED') ON CONFLICT DO NOTHING`,
        [academy.id, academy.roleIds.teacher],
      );
      const { rows } = await su.query<{ v: number }>(
        'SELECT permissions_version AS v FROM membership WHERE id = $1',
        [academy.user.membershipId],
      );
      return rows[0]!.v;
    });

    await migrator.query('BEGIN');
    const added = await syncSystemRoleGrants(migrator);
    await migrator.query('COMMIT');
    expect(added).toBeGreaterThanOrEqual(1);

    await asSuperuser(async (su) => {
      const { rows: owner } = await su.query(
        `SELECT scope FROM role_permission WHERE role_id = $1 AND capability = 'student.health.read'`,
        [academy.roleIds.owner],
      );
      expect(owner).toEqual([{ scope: 'TENANT' }]);
      const { rows: custom } = await su.query(
        `SELECT scope FROM role_permission WHERE role_id = $1 AND capability = 'payment.record_cash'`,
        [academy.roleIds.teacher],
      );
      expect(custom).toEqual([{ scope: 'ASSIGNED' }]);
      const { rows: member } = await su.query<{ v: number }>(
        'SELECT permissions_version AS v FROM membership WHERE id = $1',
        [academy.user.membershipId],
      );
      expect(member[0]!.v).toBe(before + 1);
    });
  });

  it('is a no-op when every grant is present, and leaves FORCE RLS on', async () => {
    await migrator.query('BEGIN');
    await syncSystemRoleGrants(migrator);
    const again = await syncSystemRoleGrants(migrator);
    await migrator.query('COMMIT');
    expect(again).toBe(0);
    const { rows } = await migrator.query<{ relname: string; relforcerowsecurity: boolean }>(
      `SELECT relname, relforcerowsecurity FROM pg_class
        WHERE relname IN ('role', 'role_permission', 'membership_role', 'membership')`,
    );
    expect(rows.every((r) => r.relforcerowsecurity)).toBe(true);
    expect(rows).toHaveLength(4);
  });

  it('grants the C-104 capabilities only to the intended roles', () => {
    const holders = (capability: string) =>
      systemRoleGrantRows()
        .filter(([, c]) => c === capability)
        .map(([role, , scope]) => `${role}:${scope}`)
        .sort();
    expect(holders('student.health.read')).toEqual([
      'admin:BRANCH',
      'owner:TENANT',
      'teacher:ASSIGNED',
    ]);
    expect(holders('student.health.manage')).toEqual(['admin:BRANCH', 'owner:TENANT']);
    expect(holders('student.import')).toEqual(['admin:BRANCH', 'owner:TENANT']);
  });
});
