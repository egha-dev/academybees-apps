import { type KeyRing, signAccessToken } from '@academybee/auth';
import { createTenantFixture, FIXTURE_PASSWORD, type TenantFixture } from '@academybee/testing';
import { type INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AUTH_KEYS } from '../../src/core/auth/keys.js';
import { MembershipService } from '../../src/core/auth/membership.service.js';
import { createTestApp } from '../support/test-app.js';

/**
 * Sessions and authentication security (IMPLEMENTATION_PLAN Phase 2 tests; ADR-006/007).
 * Cookie names are the insecure-dev ones (plain-http test hosts, C-64).
 */
const urls = inject('databaseUrls');

type Session = { cookie: string; csrf: string; setCookies: string[] };

describe('sessions', () => {
  let app: INestApplication;
  let a: TenantFixture;
  let b: TenantFixture;
  let su: pg.Client;
  const host = (t: TenantFixture) => `${t.slug}.localhost`;
  const http = () => request(app.getHttpServer());

  const login = (t: TenantFixture, identifier = a.user.email, password = FIXTURE_PASSWORD) =>
    http().post('/api/v1/auth/login').set('Host', host(t)).send({ identifier, password });

  const toSession = (res: request.Response): Session => {
    const setCookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const pairs = setCookies.map((c) => c.split(';')[0]!);
    return {
      setCookies,
      cookie: pairs.join('; '),
      csrf: pairs.find((p) => p.startsWith('ab_csrf='))?.slice('ab_csrf='.length) ?? '',
    };
  };

  const signIn = async (t: TenantFixture = a): Promise<Session> => {
    const res = await login(t, t.user.email);
    expect(res.status).toBe(200);
    return toSession(res);
  };

  const me = (t: TenantFixture, s: Session) =>
    http().get('/api/v1/auth/me').set('Host', host(t)).set('Cookie', s.cookie);

  const refresh = (t: TenantFixture, s: Session) =>
    http()
      .post('/api/v1/auth/refresh')
      .set('Host', host(t))
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf);

  beforeAll(async () => {
    [a, b] = await Promise.all([
      createTenantFixture(urls.migrator, { name: 'Session Academy A' }),
      createTenantFixture(urls.migrator, { name: 'Session Academy B' }),
    ]);
    app = await createTestApp();
    su = new pg.Client({ connectionString: urls.superuser });
    await su.connect();
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
    await su.query(`UPDATE user_credential SET failed_count = 0, locked_until = NULL`);
  });

  describe('sign-in', () => {
    it('sets host-only, httpOnly, SameSite=Lax cookies and says where to go', async () => {
      const res = await login(a);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        user: { name: `Owner of Session Academy A` },
        experience: 'manage',
        redirectTo: '/today',
      });
      const s = toSession(res);
      const byName = (n: string) => s.setCookies.find((c) => c.startsWith(`${n}=`)) ?? '';
      expect(byName('ab_at')).toMatch(/HttpOnly/);
      expect(byName('ab_at')).toMatch(/SameSite=Lax/);
      expect(byName('ab_at')).toMatch(/Path=\//);
      expect(byName('ab_rt')).toMatch(/Path=\/api\/v1\/auth/);
      expect(byName('ab_csrf')).not.toMatch(/HttpOnly/);
      for (const c of s.setCookies) expect(c).not.toMatch(/Domain=/i);
    });

    it('answers a wrong password, an unknown user and a non-member identically', async () => {
      const wrong = await login(a, a.user.email, 'Not-The-Password-1');
      const unknown = await login(a, 'nobody@example.test', 'Not-The-Password-1');
      const nonMember = await login(b, a.user.email); // correct password, wrong academy
      for (const res of [wrong, unknown, nonMember]) {
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
        expect(res.headers['set-cookie']).toBeUndefined();
      }
      expect(wrong.body.error.message).toBe(unknown.body.error.message);
    });

    it('rate-limits sign-in attempts with Retry-After', async () => {
      let last: request.Response | undefined;
      for (let i = 0; i < 6; i++) last = await login(a, a.user.email, `Wrong-Password-${i}`);
      expect(last?.status).toBe(429);
      expect(last?.body.error.code).toBe('RATE_LIMITED');
      expect(Number(last?.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('locks the account after repeated failures, even for the right password', async () => {
      for (let i = 0; i < 5; i++) {
        await login(a, a.user.email, `Wrong-Password-${i}`);
        // Keep the per-identifier window open so only the account lock is tested.
        const redis = new Redis(inject('redisUrl'));
        const keys = await redis.keys('rl:*');
        if (keys.length) await redis.del(...keys);
        await redis.quit();
      }
      const res = await login(a);
      expect(res.status).toBe(429);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('refuses an anonymous cross-origin sign-in post', async () => {
      const res = await http()
        .post('/api/v1/auth/login')
        .set('Host', host(a))
        .set('Origin', 'https://evil.example')
        .send({ identifier: a.user.email, password: FIXTURE_PASSWORD });
      expect(res.status).toBe(403);
    });
  });

  describe('tokens and audiences', () => {
    it('/auth/me returns the user, roles and capabilities in this academy', async () => {
      const res = await me(a, await signIn());
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        user: { id: a.user.id, email: a.user.email },
        audience: 'TENANT',
        academy: { roles: ['owner'], capabilities: { 'academy.settings.manage': 'TENANT' } },
      });
    });

    it('a session from academy A on academy B → 401 TENANT_MISMATCH, recorded on the platform audit', async () => {
      const s = await signIn(a);
      const res = await me(b, s);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TENANT_MISMATCH');
      expect(JSON.stringify(res.body)).not.toContain(a.id);
      const { rows } = await su.query(
        `SELECT tenant_id FROM audit_log WHERE action = 'auth.tenant_mismatch' AND actor_id = $1`,
        [a.user.id],
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r: { tenant_id: string | null }) => r.tenant_id === null)).toBe(true);
    });

    it('a tenant session is rejected on the Family Hub and console hosts, and nowhere else', async () => {
      const s = await signIn(a);
      for (const other of ['app.localhost', 'console.localhost', 'localhost']) {
        const res = await http().get('/api/v1/auth/me').set('Host', other).set('Cookie', s.cookie);
        expect(res.status, other).toBe(401);
      }
    });

    it('a hub or console token is rejected on an academy host', async () => {
      const keys = app.get<KeyRing>(AUTH_KEYS);
      for (const aud of ['HUB', 'CONSOLE'] as const) {
        const token = await signAccessToken({ sub: a.user.id, sid: a.user.id, aud, ver: 1 }, keys);
        const res = await http()
          .get('/api/v1/auth/me')
          .set('Host', host(a))
          .set('Cookie', `ab_at=${token}`);
        expect(res.status, aud).toBe(401);
      }
    });

    it('an expired access token → 401 SESSION_EXPIRED', async () => {
      const keys = app.get<KeyRing>(AUTH_KEYS);
      const token = await signAccessToken(
        { sub: a.user.id, sid: a.user.id, aud: 'TENANT', tid: a.id, ver: 1 },
        keys,
        -120,
      );
      const res = await http()
        .get('/api/v1/auth/me')
        .set('Host', host(a))
        .set('Cookie', `ab_at=${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('SESSION_EXPIRED');
    });

    it('a disabled membership is refused on the next request', async () => {
      const s = await signIn(a);
      expect((await me(a, s)).status).toBe(200);
      await su.query(`UPDATE membership SET status = 'DISABLED' WHERE id = $1`, [
        a.user.membershipId,
      ]);
      await app.get(MembershipService).invalidate(a.id, a.user.id);
      try {
        expect((await me(a, s)).status).toBe(401);
      } finally {
        await su.query(`UPDATE membership SET status = 'ACTIVE' WHERE id = $1`, [
          a.user.membershipId,
        ]);
        await app.get(MembershipService).invalidate(a.id, a.user.id);
      }
    });
  });

  describe('refresh rotation (ADR-007)', () => {
    it('rotates the refresh token; the new session works', async () => {
      const s = await signIn();
      const res = await refresh(a, s);
      expect(res.status).toBe(204);
      const next = toSession(res);
      expect(next.cookie).not.toBe(s.cookie);
      const merged = {
        ...next,
        csrf: next.csrf || s.csrf,
        cookie: `${next.cookie}; ab_csrf=${s.csrf}`,
      };
      expect((await me(a, merged)).status).toBe(200);
    });

    it('a rotated token presented again within seconds is a tab race (409), not theft', async () => {
      const s = await signIn();
      expect((await refresh(a, s)).status).toBe(204);
      const again = await refresh(a, s);
      expect(again.status).toBe(409);
    });

    it('reusing a rotated token later revokes the whole family', async () => {
      const s = await signIn();
      const rotated = await refresh(a, s);
      const next = toSession(rotated);
      // Move the rotation outside the grace window.
      await su.query(
        `UPDATE auth_session SET revoked_at = now() - interval '5 minutes' WHERE user_id = $1 AND revoke_reason = 'rotated'`,
        [a.user.id],
      );
      const reuse = await refresh(a, s);
      expect(reuse.status).toBe(401);
      const withNew = await refresh(a, {
        ...next,
        cookie: `${next.cookie}; ab_csrf=${s.csrf}`,
        csrf: s.csrf,
      });
      expect(withNew.status).toBe(401);
      const { rows } = await su.query(
        `SELECT count(*)::int AS n FROM audit_log WHERE action = 'auth.refresh_reuse' AND actor_id = $1`,
        [a.user.id],
      );
      expect(rows[0].n).toBeGreaterThan(0);
    });
  });

  describe('CSRF and sign-out', () => {
    it('a mutation with session cookies but no CSRF header → 403', async () => {
      const s = await signIn();
      const res = await http()
        .post('/api/v1/auth/logout')
        .set('Host', host(a))
        .set('Cookie', s.cookie)
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('signs out this device; the session stops working', async () => {
      const s = await signIn();
      const res = await http()
        .post('/api/v1/auth/logout')
        .set('Host', host(a))
        .set('Cookie', s.cookie)
        .set('x-csrf-token', s.csrf)
        .send({});
      expect(res.status).toBe(204);
      expect((await me(a, s)).status).toBe(401);
    });

    it('signs out everywhere: other devices stop working too', async () => {
      const first = await signIn();
      const second = await signIn();
      await http()
        .post('/api/v1/auth/logout')
        .set('Host', host(a))
        .set('Cookie', second.cookie)
        .set('x-csrf-token', second.csrf)
        .send({ everywhere: true });
      expect((await me(a, first)).status).toBe(401);
    });
  });
});
