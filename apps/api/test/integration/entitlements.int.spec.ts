import { addMemberFixture, createTenantFixture, FIXTURE_PASSWORD } from '@academybee/testing';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createTestApp } from '../support/test-app.js';

/** Plans and limits (ADR-028, C-89): `@Feature` / `@Limit` after `@Can`. */
const urls = inject('databaseUrls');

describe('entitlements', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  async function session(host: string, email: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', host)
      .send({ identifier: email, password: FIXTURE_PASSWORD });
    expect(res.status, `sign-in ${email}`).toBe(200);
    const cookies = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .map((c) => c.split(';')[0]!);
    const csrf = cookies.find((c) => c.includes('csrf'))?.split('=')[1] ?? '';
    return { cookie: cookies.join('; '), csrf };
  }

  async function withMigrator<T>(tenantId: string, fn: (c: pg.Client) => Promise<T>) {
    const c = new pg.Client({ connectionString: urls.migrator });
    await c.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const out = await fn(c);
      await c.query('COMMIT');
      return out;
    } finally {
      await c.end();
    }
  }

  it('refuses creation past the plan limit with ENTITLEMENT_LIMIT_REACHED, naming the limit', async () => {
    const a = await createTenantFixture(urls.migrator); // Trial: 1 branch, and it has its default one
    const host = `${a.slug}.localhost`;
    const s = await session(host, a.user.email);
    const res = await request(app.getHttpServer())
      .post('/api/v1/test/secure/branches')
      .set('Host', host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .send({ count: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ENTITLEMENT_LIMIT_REACHED');
    expect(res.body.error.details).toEqual([{ path: 'branches', issue: 'limit_reached' }]);
  });

  it('a platform override raises the limit for that academy only', async () => {
    const a = await createTenantFixture(urls.migrator);
    const b = await createTenantFixture(urls.migrator);
    await withMigrator(a.id, (c) =>
      c.query(
        `INSERT INTO subscription_override (id, tenant_id, key, kind, "limit", reason)
         VALUES (gen_random_uuid(), $1, 'branches', 'LIMIT', 3, 'test')`,
        [a.id],
      ),
    );
    const post = async (t: typeof a, count: number) => {
      const host = `${t.slug}.localhost`;
      const s = await session(host, t.user.email);
      return request(app.getHttpServer())
        .post('/api/v1/test/secure/branches')
        .set('Host', host)
        .set('Cookie', s.cookie)
        .set('x-csrf-token', s.csrf)
        .send({ count });
    };
    expect((await post(a, 2)).status).toBe(200);
    expect((await post(a, 3)).status).toBe(403);
    expect((await post(b, 1)).status).toBe(403);
  });

  it('features follow the plan: Pro has advanced reports, Trial does not', async () => {
    const trial = await createTenantFixture(urls.migrator);
    const pro = await createTenantFixture(urls.migrator, { plan: 'pro' });
    const get = async (t: typeof trial) => {
      const host = `${t.slug}.localhost`;
      const s = await session(host, t.user.email);
      return request(app.getHttpServer())
        .get('/api/v1/test/secure/advanced-reports')
        .set('Host', host)
        .set('Cookie', s.cookie);
    };
    const refused = await get(trial);
    expect(refused.status).toBe(403);
    expect(refused.body.error).toMatchObject({
      code: 'FEATURE_NOT_IN_PLAN',
      details: [{ path: 'reports_advanced', issue: 'not_in_plan' }],
    });
    expect((await get(pro)).status).toBe(200);
  });

  it('an academy without a subscription gets nothing (fail closed)', async () => {
    const a = await createTenantFixture(urls.migrator, { plan: null });
    const host = `${a.slug}.localhost`;
    const s = await session(host, a.user.email);
    const res = await request(app.getHttpServer())
      .get('/api/v1/test/secure/advanced-reports')
      .set('Host', host)
      .set('Cookie', s.cookie);
    expect(res.body.error.code).toBe('FEATURE_NOT_IN_PLAN');
  });

  it('checks the capability before the plan: a member without it learns nothing', async () => {
    const a = await createTenantFixture(urls.migrator, { plan: 'pro' });
    const m = await addMemberFixture(urls.migrator, a.id, {
      email: `nocap-${a.slug}@example.test`,
      roleKey: 'nocap',
      grants: [],
    });
    const host = `${a.slug}.localhost`;
    const s = await session(host, m.email);
    const res = await request(app.getHttpServer())
      .post('/api/v1/test/secure/branches')
      .set('Host', host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .send({ count: 99 });
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
