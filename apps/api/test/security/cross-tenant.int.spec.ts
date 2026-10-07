import {
  addMemberFixture,
  createTenantFixture,
  FIXTURE_PASSWORD,
  leaksTenant,
  type MemberFixture,
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
  let limited: MemberFixture;
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
    // A member of A with no capabilities beyond announcements (for the 403 checks).
    limited = await addMemberFixture(urls.migrator, a.id, {
      email: `limited-${a.slug}@example.test`,
      roleKey: 'limited',
      grants: [{ capability: 'announcement.read', scope: 'TENANT' }],
    });
    // A pending invitation for resend/revoke, so the fixture's own link keeps working.
    const owner = await signIn(a);
    const spare = await request(app.getHttpServer())
      .post('/api/v1/team/invitations')
      .set('Host', ref(a).host)
      .set('Cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ email: `spare-${a.slug}@example.test`, roles: ['teacher'] });
    expect(spare.status, 'spare invitation').toBe(201);
    spareInvitationId = spare.body.id as string;
  });
  afterAll(async () => {
    await app.close();
  });

  it('every route that resolves an academy is in the registry', () => {
    const tenantRoutes = listRoutes(app).filter(
      (r) =>
        (r.policy === 'tenant' || r.policy === 'any') &&
        !NOT_TENANT_ROUTES.has(`${r.method} ${r.path}`),
    );
    expect(missingFromRegistry(tenantRoutes, CROSS_TENANT_ROUTES)).toEqual([]);
  });

  /** Path parameters are filled with academy A's records (`params` names them). */
  let spareInvitationId = '';
  const fixtureValue = (name: string): string => {
    switch (name) {
      case 'limited-membership':
        return limited.membershipId;
      case 'spare-invitation':
        return spareInvitationId;
      case 'invitation-token':
        return a.invitationToken;
      default:
        throw new Error(`unknown fixture ${name}`);
    }
  };
  /** Body values `@fixture:<name>` are filled with academy A's records too. */
  const bodyFor = (route: (typeof CROSS_TENANT_ROUTES)[number]) =>
    route.body &&
    Object.fromEntries(
      Object.entries(route.body).map(([k, v]) => [
        k,
        typeof v === 'string' && v.startsWith('@fixture:')
          ? fixtureValue(v.slice('@fixture:'.length))
          : v,
      ]),
    );
  const pathFor = (route: (typeof CROSS_TENANT_ROUTES)[number]) =>
    route.path.replace(/:(\w+)/g, (_, name: string) =>
      route.params?.[name] ? fixtureValue(route.params[name]) : a.user.membershipId,
    );
  const verb = (method: string) =>
    ({ GET: 'get', POST: 'post', PUT: 'put', PATCH: 'patch', DELETE: 'delete' })[method] as
      'get' | 'post' | 'put' | 'patch' | 'delete';

  /** Sign in; returns the cookies and CSRF token (insecure-dev names). */
  const signIn = async (t: TenantFixture, email = t.user.email) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', ref(t).host)
      .send({ identifier: email, password: FIXTURE_PASSWORD });
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
    let req = request(app.getHttpServer())[verb(route.method)](pathFor(route)).set('Host', host);
    if (session) req = req.set('Cookie', session.cookie).set('x-csrf-token', session.csrf);
    if (route.idempotent) req = req.set('Idempotency-Key', crypto.randomUUID());
    if (extra.query) req = req.query(extra.query);
    for (const [k, v] of Object.entries(extra.headers ?? {})) req = req.set(k, v);
    const body =
      route.path === '/api/v1/auth/login'
        ? { identifier: a.user.email, password: FIXTURE_PASSWORD }
        : bodyFor(route);
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

  it('every private route declares @Can or @SignedIn (fail-closed guard, ADR-008)', () => {
    const undeclared = listRoutes(app)
      .filter((r) => r.policy !== 'none' && !r.isPublic && !r.capability && !r.signedIn)
      .map((r) => `${r.method} ${r.path}`);
    expect(undeclared).toEqual([]);
  });

  const raw = (
    route: (typeof CROSS_TENANT_ROUTES)[number],
    host: string,
    session?: { cookie: string; csrf: string },
  ) => {
    let req = request(app.getHttpServer())[verb(route.method)](pathFor(route)).set('Host', host);
    if (session) req = req.set('Cookie', session.cookie).set('x-csrf-token', session.csrf);
    if (route.idempotent) req = req.set('Idempotency-Key', crypto.randomUUID());
    return route.method === 'GET' ? req : req.send(bodyFor(route) ?? {});
  };

  describe.each(
    CROSS_TENANT_ROUTES.filter(
      (r) => r.session && r.path !== '/api/v1/auth/logout' && r.path !== '/api/v1/auth/refresh',
    ),
  )('session checks: $method $path', (route) => {
    it('without a session → 401', async () => {
      expect((await raw(route, ref(a).host)).status).toBe(401);
    });

    it("academy A's session on academy B's host → 401 TENANT_MISMATCH", async () => {
      const res = await raw(route, ref(b).host, await signIn(a));
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TENANT_MISMATCH');
      expect(leaksTenant(res.body, ref(a))).toEqual([]);
    });

    if (route.capability)
      it(`a member without ${route.capability} → 403`, async () => {
        const res = await raw(route, ref(a).host, await signIn(a, limited.email));
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      });
  });

  describe.each(CROSS_TENANT_ROUTES.filter((r) => typeof r.spoof !== 'object'))(
    '$method $path',
    (route) => {
      it.each(tenantSpoofAttempts({ id: '', slug: '', name: '', host: '' }).map((x) => x.name))(
        'ignores %s',
        async (attemptName) => {
          const victim = ref(b);
          const attempt = tenantSpoofAttempts(victim).find((x) => x.name === attemptName)!;
          const baseline = await send(route, ref(a).host);
          // Not vacuous: the route really serves academy A here (a 404 on both proves nothing).
          expect(baseline.status, 'baseline must succeed on A').toBeLessThan(400);
          const spoofed = await send(route, ref(a).host, attempt);
          expect(spoofed.status).toBe(baseline.status);
          const stable = (body: unknown): unknown =>
            JSON.parse(
              JSON.stringify(body, (k, v: unknown) =>
                route.volatile?.includes(k) ? undefined : v,
              ),
            );
          if (route.spoof !== 'status') expect(stable(spoofed.body)).toEqual(stable(baseline.body));
          expect(leaksTenant(spoofed.body, victim)).toEqual([]);
        },
      );
    },
  );

  it('single-use routes skipped above name the test that covers them', () => {
    for (const route of CROSS_TENANT_ROUTES)
      if (typeof route.spoof === 'object') expect(route.spoof.skip).toMatch(/\.int\.spec\.ts › /);
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
