import {
  createTenantFixture,
  FIXTURE_PASSWORD,
  leaksTenant,
  missingFromRegistry,
  type TenantFixture,
  type TenantRef,
  tenantSpoofAttempts,
} from '@academybee/testing';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { listRoutes } from '../support/routes.js';
import { createTestApp } from '../support/test-app.js';
import { CROSS_TENANT_ROUTES, NOT_TENANT_ROUTES } from './cross-tenant.registry.js';

/** Cross-tenant suite (ADR-005, CLAUDE.md §5). Grows with every tenant-scoped endpoint. */
describe('cross-tenant suite', () => {
  let app: INestApplication;
  let a: TenantFixture;
  let b: TenantFixture;
  const ref = (t: TenantFixture): TenantRef => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    host: `${t.slug}.localhost`,
  });

  beforeAll(async () => {
    const urls = inject('databaseUrls');
    [a, b] = await Promise.all([
      createTenantFixture(urls.migrator, { name: 'Cross Academy A' }),
      createTenantFixture(urls.migrator, { name: 'Cross Academy B' }),
    ]);
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('every route that resolves an academy is in the registry', () => {
    const tenantRoutes = listRoutes(app).filter(
      (r) => r.policy !== 'none' && !NOT_TENANT_ROUTES.has(`${r.method} ${r.path}`),
    );
    expect(missingFromRegistry(tenantRoutes, CROSS_TENANT_ROUTES)).toEqual([]);
  });

  /** Sign in as academy A's fixture user; returns the cookies and CSRF token (insecure-dev names). */
  const signIn = async (t: TenantFixture) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', ref(t).host)
      .send({ identifier: t.user.email, password: FIXTURE_PASSWORD });
    expect(res.status, 'fixture sign-in').toBe(200);
    const cookies = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .map((c) => c.split(';')[0]!);
    const csrf = cookies.find((c) => c.startsWith('ab_csrf='))!.slice('ab_csrf='.length);
    return { cookie: cookies.join('; '), csrf };
  };

  const send = async (
    route: (typeof CROSS_TENANT_ROUTES)[number],
    host: string,
    extra: { query?: object; headers?: Record<string, string>; body?: object } = {},
  ) => {
    // Sign in first: supertest binds its server when a request is created.
    const session = route.session ? await signIn(a) : undefined;
    let req = request(app.getHttpServer())
      [route.method === 'GET' ? 'get' : route.method === 'POST' ? 'post' : 'put'](route.path)
      .set('Host', host);
    if (session) req = req.set('Cookie', session.cookie).set('x-csrf-token', session.csrf);
    if (extra.query) req = req.query(extra.query);
    for (const [k, v] of Object.entries(extra.headers ?? {})) req = req.set(k, v);
    const body =
      route.path === '/api/v1/auth/login'
        ? { identifier: a.user.email, password: FIXTURE_PASSWORD }
        : route.body;
    if (route.method !== 'GET') req = req.send({ ...body, ...extra.body });
    return req;
  };

  // Each case signs in several times; start every case with clean rate-limit counters.
  beforeEach(async () => {
    const redis = new Redis(inject('redisUrl'));
    const keys = await redis.keys('rl:*');
    if (keys.length) await redis.del(...keys);
    await redis.quit();
  });

  describe.each(CROSS_TENANT_ROUTES)('$method $path', (route) => {
    it.each(tenantSpoofAttempts({ id: '', slug: '', name: '', host: '' }).map((x) => x.name))(
      'ignores %s',
      async (attemptName) => {
        const victim = ref(b);
        const attempt = tenantSpoofAttempts(victim).find((x) => x.name === attemptName)!;
        const baseline = await send(route, ref(a).host);
        // Not vacuous: the route really serves academy A here (a 404 on both would prove nothing).
        expect(baseline.status, 'baseline must succeed on A').toBeLessThan(400);
        const spoofed = await send(route, ref(a).host, attempt);
        expect(spoofed.status).toBe(baseline.status);
        expect(spoofed.body).toEqual(baseline.body);
        expect(leaksTenant(spoofed.body, victim)).toEqual([]);
      },
    );
  });

  it('the probe sees each academy only on its own host', async () => {
    const onA = await request(app.getHttpServer())
      .get('/api/v1/test/academy/probe')
      .set('Host', ref(a).host);
    const onB = await request(app.getHttpServer())
      .get('/api/v1/test/academy/probe')
      .set('Host', ref(b).host);
    expect(onA.body.tenantId).toBe(a.id);
    expect(onB.body.tenantId).toBe(b.id);
    const tenantsOf = (body: { branches: Array<{ tenantId: string }> }) =>
      new Set(body.branches.map((r) => r.tenantId));
    expect(tenantsOf(onA.body as never)).toEqual(new Set([a.id]));
    expect(tenantsOf(onB.body as never)).toEqual(new Set([b.id]));
  });
});
