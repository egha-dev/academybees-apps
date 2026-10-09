import { newId } from '@academybee/contracts';
import { createTenantFixture, FIXTURE_PASSWORD, type TenantFixture } from '@academybee/testing';
import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { CONSOLE_HOST, consoleSession, type ConsoleSession } from '../support/console-session.js';
import { createTestApp } from '../support/test-app.js';

/**
 * Academy management in the console (C-02, C-86, C-87, C-96): list and detail, status changes
 * with a reason (sessions end, sign-in refused, visible at once), subdomain changes that keep the
 * old address redirecting, and who may do what.
 */
const urls = inject('databaseUrls');

describe('console academy management', () => {
  let app: INestApplication;
  let su: pg.Client;
  let admin: ConsoleSession;
  let support: ConsoleSession;
  const http = () => request(app.getHttpServer());
  const host = (t: { slug: string }) => `${t.slug}.localhost`;

  const post = (path: string, body: Record<string, unknown>, s = admin) =>
    http()
      .post(`/api/v1/platform${path}`)
      .set('Host', CONSOLE_HOST)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .set('Idempotency-Key', newId())
      .send(body);
  const get = (path: string, s = admin) =>
    http().get(`/api/v1/platform${path}`).set('Host', CONSOLE_HOST).set('Cookie', s.cookie);
  const signIn = (t: TenantFixture, h = host(t)) =>
    http()
      .post('/api/v1/auth/login')
      .set('Host', h)
      .send({ identifier: t.user.email, password: FIXTURE_PASSWORD });
  const cookieOf = (res: request.Response) =>
    ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .map((c) => c.split(';')[0]!)
      .join('; ');
  const context = (h: string) => http().get('/api/v1/tenant/context').set('Host', h);

  beforeAll(async () => {
    app = await createTestApp();
    su = new pg.Client({ connectionString: urls.superuser });
    await su.connect();
    admin = await consoleSession(app, urls.superuser);
    support = await consoleSession(app, urls.superuser, 'SUPPORT');
  });
  afterAll(async () => {
    await su.end();
    await app.close();
  });
  beforeEach(async () => {
    const redis = new Redis(inject('redisUrl'));
    const keys = await redis.keys('rl:*');
    if (keys.length) await redis.del(...keys);
    await redis.quit();
  });

  it('lists academies newest first, with search, status filter and keyset paging', async () => {
    const tag = newId().slice(-6);
    const made: TenantFixture[] = [];
    for (let i = 0; i < 3; i++)
      made.push(await createTenantFixture(urls.migrator, { name: `Listing ${tag} ${i}` }));
    await createTenantFixture(urls.migrator, {
      name: `Listing ${tag} paused`,
      status: 'SUSPENDED',
    });

    const first = await get(`/tenants?q=${tag}&limit=2`);
    expect(first.status).toBe(200);
    expect((first.body as { items: { name: string }[] }).items.map((a) => a.name)).toEqual([
      `Listing ${tag} paused`,
      `Listing ${tag} 2`,
    ]);
    const next = await get(`/tenants?q=${tag}&limit=2&cursor=${first.body.nextCursor as string}`);
    expect((next.body as { items: { name: string }[] }).items.map((a) => a.name)).toEqual([
      `Listing ${tag} 1`,
      `Listing ${tag} 0`,
    ]);
    expect(next.body.nextCursor).toBeNull();
    const suspended = await get(`/tenants?q=${tag}&status=SUSPENDED`);
    expect(suspended.body.items).toHaveLength(1);
    expect(suspended.body.items[0]).toMatchObject({
      host: expect.stringMatching(/\.localhost$/),
      planKey: 'trial',
      onboardingCompleted: true,
    });
    expect((await get('/tenants?cursor=nonsense')).status).toBe(400);
  });

  it('viewing an academy is recorded on its audit trail', async () => {
    const t = await createTenantFixture(urls.migrator);
    const res = await get(`/tenants/${t.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: t.id, slug: t.slug, status: 'ACTIVE' });
    const { rows } = await su.query(
      `SELECT actor_id FROM audit_log WHERE action='platform.tenant_viewed' AND tenant_id=$1`,
      [t.id],
    );
    expect(rows).toEqual([{ actor_id: admin.userId }]);
    expect((await get(`/tenants/${newId()}`)).status).toBe(404);
    expect((await get('/tenants/not-a-uuid')).status).toBe(404);
  });

  it('suspend ends sessions and refuses sign-in at once; reactivate restores it (C-86, C-87)', async () => {
    const t = await createTenantFixture(urls.migrator);
    const owner = cookieOf(await signIn(t));
    // Warm every cache: host resolution and session validity.
    expect((await context(host(t))).body.status).toBe('ACTIVE');
    expect(
      (await http().get('/api/v1/auth/me').set('Host', host(t)).set('Cookie', owner)).status,
    ).toBe(200);

    const noReason = await post(`/tenants/${t.id}/suspend`, {});
    expect(noReason.status).toBe(400);
    const suspended = await post(`/tenants/${t.id}/suspend`, { reason: 'Unpaid invoice' });
    expect(suspended.status).toBe(200);
    expect(suspended.body).toMatchObject({
      status: 'SUSPENDED',
      previousStatus: 'ACTIVE',
      statusReason: 'Unpaid invoice',
    });

    expect((await context(host(t))).body).toEqual({ status: 'SUSPENDED', displayName: t.name });
    expect(
      (await http().get('/api/v1/auth/me').set('Host', host(t)).set('Cookie', owner)).status,
    ).toBe(401);
    const login = await signIn(t);
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('TENANT_UNAVAILABLE');
    expect(login.headers['set-cookie']).toBeUndefined();
    const { rows } = await su.query(
      `SELECT count(*)::int n FROM auth_session WHERE tenant_id=$1 AND revoked_at IS NULL`,
      [t.id],
    );
    expect(rows[0].n).toBe(0);
    expect((await post(`/tenants/${t.id}/suspend`, { reason: 'Again' })).body.error.code).toBe(
      'INVALID_STATE_TRANSITION',
    );

    const back = await post(`/tenants/${t.id}/reactivate`, { reason: 'Paid' });
    expect(back.body).toMatchObject({ status: 'ACTIVE', previousStatus: null });
    expect((await context(host(t))).body.status).toBe('ACTIVE');
    expect((await signIn(t)).status).toBe(200);
    const audit = await su.query(
      `SELECT action, metadata->>'reason' AS reason FROM audit_log
        WHERE tenant_id=$1 AND action LIKE 'platform.tenant_%ed' AND action <> 'platform.tenant_viewed'
        ORDER BY created_at`,
      [t.id],
    );
    expect(audit.rows).toEqual([
      { action: 'platform.tenant_suspended', reason: 'Unpaid invoice' },
      { action: 'platform.tenant_reactivated', reason: 'Paid' },
    ]);
  });

  it('a suspended academy refuses token refresh too', async () => {
    const t = await createTenantFixture(urls.migrator);
    const owner = cookieOf(await signIn(t));
    await post(`/tenants/${t.id}/suspend`, { reason: 'Check' });
    const csrf = owner
      .split('; ')
      .find((c) => c.startsWith('ab_csrf='))!
      .slice(8);
    const refresh = await http()
      .post('/api/v1/auth/refresh')
      .set('Host', host(t))
      .set('Cookie', owner)
      .set('x-csrf-token', csrf);
    expect(refresh.status).toBe(401);
    expect(refresh.body.error.code).toBe('UNAUTHENTICATED');
    const cookies = ([] as string[]).concat(refresh.headers['set-cookie'] ?? []).join(';');
    expect(cookies).not.toMatch(/ab_at=[A-Za-z0-9]/);
  });

  it('a setting-up academy: suspend then reactivate returns to SETUP; activate makes it ACTIVE', async () => {
    const t = await createTenantFixture(urls.migrator, { status: 'SETUP' });
    await post(`/tenants/${t.id}/suspend`, { reason: 'Pause' });
    expect((await post(`/tenants/${t.id}/reactivate`, { reason: 'Go on' })).body.status).toBe(
      'SETUP',
    );
    expect((await post(`/tenants/${t.id}/activate`, { reason: 'Ready' })).body.status).toBe(
      'ACTIVE',
    );
    expect((await post(`/tenants/${t.id}/activate`, { reason: 'Twice' })).status).toBe(409);
  });

  it('archive closes the academy for good (no un-archive here)', async () => {
    const t = await createTenantFixture(urls.migrator);
    expect((await post(`/tenants/${t.id}/archive`, { reason: 'Closed down' })).body.status).toBe(
      'ARCHIVED',
    );
    expect((await context(host(t))).body).toEqual({ status: 'ARCHIVED' });
    expect((await signIn(t)).status).toBe(403);
    expect((await post(`/tenants/${t.id}/reactivate`, { reason: 'Oops' })).status).toBe(409);
  });

  it('changing the subdomain: the new one serves the academy, the old one redirects and stays reserved', async () => {
    const t = await createTenantFixture(urls.migrator);
    expect((await context(host(t))).body.status).toBe('ACTIVE');
    const next = `moved-${newId().slice(-8)}`;
    const res = await post(`/tenants/${t.id}/domains`, { slug: next });
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe(next);
    expect(
      (res.body as { domains: { host: string; role: string }[] }).domains.map((d) => [
        d.host,
        d.role,
      ]),
    ).toEqual([
      [`${next}.localhost`, 'PRIMARY'],
      [`${t.slug}.localhost`, 'REDIRECT'],
    ]);
    expect((await context(`${next}.localhost`)).body.status).toBe('ACTIVE');
    expect((await context(host(t))).body).toEqual({
      status: 'REDIRECT',
      host: `${next}.localhost`,
    });
    // The academy's sessions keep working on the new address after signing in there.
    expect((await signIn(t, `${next}.localhost`)).status).toBe(200);

    expect((await post(`/tenants/${t.id}/domains`, { slug: next })).body.error.details).toEqual([
      { path: 'slug', issue: 'unchanged' },
    ]);
    const other = await createTenantFixture(urls.migrator);
    const taken = await post(`/tenants/${other.id}/domains`, { slug: t.slug });
    expect(taken.status).toBe(409);
    expect((await post(`/tenants/${other.id}/domains`, { slug: 'admin' })).status).toBe(400);
    const audit = await su.query(
      `SELECT before->>'slug' AS "from", after->>'slug' AS "to" FROM audit_log
        WHERE tenant_id=$1 AND action='platform.tenant_subdomain_changed'`,
      [t.id],
    );
    expect(audit.rows).toEqual([{ from: t.slug, to: next }]);
  });

  it('an archived academy cannot take a new address (review L1)', async () => {
    const t = await createTenantFixture(urls.migrator);
    await post(`/tenants/${t.id}/archive`, { reason: 'Closed' });
    const res = await post(`/tenants/${t.id}/domains`, { slug: `after-${newId().slice(-8)}` });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('resending the owner invite replaces the pending one; refused once the owner joined', async () => {
    const created = await post('/tenants', {
      name: 'Resend Academy',
      academyType: 'music',
      slug: `resend-${newId().slice(-8)}`,
      owner: { name: 'Owner Person', email: `resend-${newId().slice(-8)}@example.test` },
    });
    const id = created.body.id as string;
    const again = await post(`/tenants/${id}/owner-invite/resend`, {});
    expect(again.status).toBe(200);
    expect(again.body.owner.invitation.status).toBe('PENDING');
    const { rows } = await su.query(
      `SELECT revoked_at IS NOT NULL AS revoked FROM invitation WHERE tenant_id=$1 ORDER BY created_at`,
      [id],
    );
    expect(rows).toEqual([{ revoked: true }, { revoked: false }]);

    const t = await createTenantFixture(urls.migrator);
    await su.query(
      `INSERT INTO invitation (id, tenant_id, email, role_keys, token_hash, expires_at)
       VALUES ($1, $2, $3, '{owner}', $4, now() + interval '7 days')`,
      [newId(), t.id, t.user.email, newId().replace(/-/g, '').padEnd(64, '0')],
    );
    const joined = await post(`/tenants/${t.id}/owner-invite/resend`, {});
    expect(joined.status).toBe(409);
  });

  describe('who may do what (C-02, ADR-005)', () => {
    it('support staff may look but not change', async () => {
      const t = await createTenantFixture(urls.migrator);
      expect((await get('/tenants', support)).status).toBe(200);
      expect((await get(`/tenants/${t.id}`, support)).status).toBe(200);
      expect((await post(`/tenants/${t.id}/suspend`, { reason: 'No' }, support)).status).toBe(403);
      expect(
        (
          await post(
            '/tenants',
            {
              name: 'x',
              academyType: 'art',
              slug: 'nope-nope',
              owner: { name: 'A B', email: 'a@b.test' },
            },
            support,
          )
        ).status,
      ).toBe(403);
      expect((await get('/slug-availability?slug=abc', support)).status).toBe(403);
    });

    it('academy sessions and anonymous callers get nothing; other hosts answer 404', async () => {
      const t = await createTenantFixture(urls.migrator);
      const owner = cookieOf(await signIn(t));
      expect(
        (
          await http()
            .get('/api/v1/platform/tenants')
            .set('Host', CONSOLE_HOST)
            .set('Cookie', owner)
        ).status,
      ).toBe(401);
      expect((await http().get('/api/v1/platform/tenants').set('Host', CONSOLE_HOST)).status).toBe(
        401,
      );
      expect(
        (
          await http()
            .get('/api/v1/platform/tenants')
            .set('Host', host(t))
            .set('Cookie', admin.cookie)
        ).status,
      ).toBe(404);
      expect(
        (await http().get('/api/v1/platform/tenants').set('Host', 'app.localhost')).status,
      ).toBe(404);
    });

    it('an academy owner holds no platform capability, and console staff no academy capability', async () => {
      const t = await createTenantFixture(urls.migrator);
      const settings = await http()
        .get('/api/v1/settings/security')
        .set('Host', host(t))
        .set('Cookie', admin.cookie);
      expect(settings.status).toBe(401);
    });
  });
});
