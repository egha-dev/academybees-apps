import { createHash } from 'node:crypto';

import { newId } from '@academybee/contracts';
import { createTenantFixture, type TenantFixture } from '@academybee/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

/**
 * Identity isolation (C-59): user-owned rows are visible to their own user; `user` rows also to
 * members of the current academy; lookups expose exactly the one row whose identifier or secret
 * the caller presents. Nothing is visible without context.
 */
const urls = inject('databaseUrls');
const sha = (v: string) => createHash('sha256').update(v).digest('hex');

type Ctx = { tenant?: string; user?: string; identifier?: string; token?: string };

describe('identity isolation (C-59)', () => {
  let a: TenantFixture;
  let b: TenantFixture;
  let app: pg.Client;
  let migrator: pg.Client;
  const sessionToken = { a: newId(), b: newId() };

  /** Run statements in one transaction as `client` with the given context GUCs. */
  async function as<T>(client: pg.Client, ctx: Ctx, fn: () => Promise<T>): Promise<T> {
    await client.query('BEGIN');
    try {
      const set = (name: string, value?: string) =>
        value ? client.query(`SELECT set_config($1, $2, true)`, [name, value]) : undefined;
      await set('app.tenant_id', ctx.tenant);
      await set('app.user_id', ctx.user);
      await set('app.lookup_identifier', ctx.identifier);
      await set('app.lookup_token', ctx.token);
      const result = await fn();
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  const ids = async (client: pg.Client, ctx: Ctx, sql: string, params: unknown[] = []) =>
    as(client, ctx, async () =>
      (await client.query<{ id: string }>(sql, params)).rows.map((r) => r.id).sort(),
    );

  beforeAll(async () => {
    [a, b] = await Promise.all([
      createTenantFixture(urls.migrator),
      createTenantFixture(urls.migrator),
    ]);
    app = new pg.Client({ connectionString: urls.app });
    migrator = new pg.Client({ connectionString: urls.migrator });
    await Promise.all([app.connect(), migrator.connect()]);
    for (const [t, token] of [
      [a, sessionToken.a],
      [b, sessionToken.b],
    ] as const) {
      await as(migrator, { user: t.user.id }, async () => {
        // The fixture already created the credential (FIXTURE_PASSWORD).
        await migrator.query(
          `INSERT INTO auth_session (id, user_id, tenant_id, audience, family_id, refresh_token_hash, expires_at)
           VALUES ($1, $2, $3, 'TENANT', $4, $5, now() + interval '30 days')`,
          [newId(), t.user.id, t.id, newId(), sha(token)],
        );
      });
    }
  });

  afterAll(async () => {
    await Promise.all([app.end(), migrator.end()]);
  });

  it('without any context, no identity row is visible', async () => {
    for (const table of ['"user"', 'user_credential', 'auth_session', 'platform_staff']) {
      const { rows } = await app.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
      expect(rows[0]?.n, table).toBe(0);
    }
  });

  it('a user sees their own identity rows and nobody else’s', async () => {
    const ctx = { user: a.user.id };
    expect(await ids(app, ctx, `SELECT id FROM "user"`)).toEqual([a.user.id]);
    expect(await ids(app, ctx, `SELECT user_id AS id FROM user_credential`)).toEqual([a.user.id]);
    expect(await ids(app, ctx, `SELECT user_id AS id FROM auth_session`)).toEqual([a.user.id]);
  });

  it('inside academy A, members of A are visible; members of B are not', async () => {
    const visible = await ids(app, { tenant: a.id }, `SELECT id FROM "user" WHERE id = ANY($1)`, [
      [a.user.id, b.user.id],
    ]);
    expect(visible).toEqual([a.user.id]);
  });

  it('an identifier lookup exposes exactly that user', async () => {
    const found = await ids(app, { identifier: a.user.email }, `SELECT id FROM "user"`);
    expect(found).toEqual([a.user.id]);
    expect(await ids(app, { identifier: 'nobody@example.test' }, `SELECT id FROM "user"`)).toEqual(
      [],
    );
  });

  it('a refresh-token lookup exposes exactly that session', async () => {
    const rows = await as(
      app,
      { token: sha(sessionToken.a) },
      async () => (await app.query<{ user_id: string }>(`SELECT user_id FROM auth_session`)).rows,
    );
    expect(rows).toEqual([{ user_id: a.user.id }]);
  });

  it('a user cannot update another user, and the app role cannot delete users', async () => {
    const updated = await as(app, { user: a.user.id }, async () =>
      app.query(`UPDATE "user" SET name = 'Hijacked' WHERE id = $1`, [b.user.id]),
    );
    expect(updated.rowCount).toBe(0);
    await expect(
      as(app, { user: a.user.id }, () =>
        app.query(`DELETE FROM "user" WHERE id = $1`, [a.user.id]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('a user can be created only for the identifier being looked up', async () => {
    await expect(
      as(app, { identifier: 'someone@example.test' }, () =>
        app.query(`INSERT INTO "user" (id, email, name, updated_at) VALUES ($1, $2, 'X', now())`, [
          newId(),
          'other@example.test',
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('platform staff rows are read-only for the app role', async () => {
    await expect(
      as(app, { user: a.user.id }, () =>
        app.query(
          `INSERT INTO platform_staff (user_id, platform_role, updated_at) VALUES ($1, 'SUPER_ADMIN', now())`,
          [a.user.id],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('own memberships across academies are listed only without an academy context (hub)', async () => {
    // Give user A a second membership, in academy B.
    const second = newId();
    await as(migrator, { tenant: b.id }, () =>
      migrator.query(
        `INSERT INTO membership (id, tenant_id, user_id, status, updated_at) VALUES ($1, $2, $3, 'ACTIVE', now())`,
        [second, b.id, a.user.id],
      ),
    );
    const hub = await ids(app, { user: a.user.id }, `SELECT tenant_id AS id FROM membership`);
    expect(hub).toEqual([a.id, b.id].sort());
    const insideA = await ids(
      app,
      { user: a.user.id, tenant: a.id },
      `SELECT tenant_id AS id FROM membership WHERE user_id = $1`,
      [a.user.id],
    );
    expect(insideA).toEqual([a.id]);
  });

  it.each([
    ['upper-case email', 'Owner@Example.test', null],
    ['no identifier at all', null, null],
    ['phone not in E.164', null, '98450 12345'],
  ])('refuses a user with %s', async (_, email, phone) => {
    const su = new pg.Client({ connectionString: urls.superuser });
    await su.connect();
    try {
      await expect(
        su.query(
          `INSERT INTO "user" (id, email, phone, name, updated_at) VALUES ($1, $2, $3, 'X', now())`,
          [newId(), email, phone],
        ),
      ).rejects.toThrow(/user_identifier_shape/);
    } finally {
      await su.end();
    }
  });

  it('accepts a phone-only user in E.164 (C-65)', async () => {
    const su = new pg.Client({ connectionString: urls.superuser });
    await su.connect();
    try {
      const { rowCount } = await su.query(
        `INSERT INTO "user" (id, phone, name, updated_at) VALUES ($1, '+919845012345', 'Phone Only', now())`,
        [newId()],
      );
      expect(rowCount).toBe(1);
    } finally {
      await su.end();
    }
  });
});
