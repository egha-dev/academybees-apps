import { type KeyRing, signAccessToken, totpCode } from '@academybee/auth';
import {
  addMemberFixture,
  createTenantFixture,
  FIXTURE_PASSWORD,
  type Grant,
  type MemberFixture,
  type TenantFixture,
} from '@academybee/testing';
import { ROLE_TEMPLATES } from '@academybee/contracts';
import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AUTH_KEYS } from '../../src/core/auth/keys.js';
import { createAdmin } from '../../src/platform/cli/create-admin.js';
import { createTestApp, testConfig } from '../support/test-app.js';

/**
 * Family Hub and console sessions (plan 2.19, 2.20; ADR-039, C-61, C-66): handoff codes, the
 * per-academy hub fan-out, console sign-in with mandatory TOTP, and audiences that never cross
 * hosts. Cookie names are the insecure-dev ones (plain-http test hosts, C-64).
 */
const urls = inject('databaseUrls');
const HUB = 'app.localhost';
const CONSOLE = 'console.localhost';
const ADMIN_PASSWORD = 'Harbour#Lantern2026';
const parentGrants: Grant[] = Object.entries(ROLE_TEMPLATES.parent.grants).map(
  ([capability, scope]) => ({ capability, scope }),
);

type Session = { cookie: string; csrf: string };

const toSession = (res: request.Response): Session => {
  const pairs = ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .map((c) => c.split(';')[0]!);
  return {
    cookie: pairs.join('; '),
    csrf: pairs.find((p) => p.startsWith('ab_csrf='))?.slice('ab_csrf='.length) ?? '',
  };
};

describe('family hub and console sessions', () => {
  let app: INestApplication;
  let a: TenantFixture;
  let b: TenantFixture;
  let parent: MemberFixture;
  let su: pg.Client;
  const http = () => request(app.getHttpServer());
  const host = (t: TenantFixture) => `${t.slug}.localhost`;
  const login = (h: string, identifier: string, password = FIXTURE_PASSWORD) =>
    http().post('/api/v1/auth/login').set('Host', h).send({ identifier, password });
  const me = (h: string, s: Session) =>
    http().get('/api/v1/auth/me').set('Host', h).set('Cookie', s.cookie);

  /** Make a fixture member's only role the academy's real parent role. */
  const makeParent = async (t: TenantFixture, member: MemberFixture) =>
    su.query(`UPDATE membership_role SET role_id = $1 WHERE membership_id = $2`, [
      t.roleIds.parent,
      member.membershipId,
    ]);

  beforeAll(async () => {
    [a, b] = await Promise.all([
      createTenantFixture(urls.migrator, { name: 'Hub Academy A' }),
      createTenantFixture(urls.migrator, { name: 'Hub Academy B' }),
    ]);
    app = await createTestApp();
    su = new pg.Client({ connectionString: urls.superuser });
    await su.connect();
    parent = await addMemberFixture(urls.migrator, a.id, {
      email: `parent-${a.slug}@example.test`,
      roleKey: 'parent',
      grants: parentGrants,
    });
    await makeParent(a, parent);
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

  describe('Family Hub (ADR-039, C-61)', () => {
    it('a parent signing in on the academy gets a handoff code, not a session', async () => {
      const res = await login(host(a), parent.email);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ handoff: { code: expect.any(String) } });
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('the code works once, only on app., and gives a HUB session listing the academy', async () => {
      const { code } = (await login(host(a), parent.email)).body.handoff as { code: string };
      const elsewhere = await http()
        .post('/api/v1/auth/handoff')
        .set('Host', host(a))
        .send({ code });
      expect(elsewhere.status).toBe(404);

      const res = await http().post('/api/v1/auth/handoff').set('Host', HUB).send({ code });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ experience: 'hub', redirectTo: '/' });
      const s = toSession(res);
      const mine = await me(HUB, s);
      expect(mine.status).toBe(200);
      expect(mine.body).toMatchObject({
        audience: 'HUB',
        hub: { academies: [{ slug: a.slug, name: 'Hub Academy A', roles: ['parent'] }] },
      });
      expect(JSON.stringify(mine.body)).not.toContain(a.id);

      const again = await http().post('/api/v1/auth/handoff').set('Host', HUB).send({ code });
      expect(again.status).toBe(401);
    });

    it('an expired or made-up code is refused', async () => {
      const { code } = (await login(host(a), parent.email)).body.handoff as { code: string };
      const redis = new Redis(inject('redisUrl'));
      for (const key of await redis.keys('auth:handoff:*')) await redis.del(key);
      await redis.quit();
      for (const c of [code, 'x'.repeat(43)]) {
        const res = await http().post('/api/v1/auth/handoff').set('Host', HUB).send({ code: c });
        expect(res.status).toBe(401);
      }
    });

    it('a parent can sign in on app. directly; staff cannot', async () => {
      const ok = await login(HUB, parent.email);
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ experience: 'hub', redirectTo: '/' });
      const staff = await login(HUB, a.user.email);
      expect(staff.status).toBe(401);
      expect(staff.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('the hub lists only ACTIVE family memberships, each read in its own academy', async () => {
      // The same parent is also a parent at B (disabled) — B must not be listed.
      const other = await addMemberFixture(urls.migrator, b.id, {
        email: `other-parent-${b.slug}@example.test`,
        roleKey: 'parent',
        grants: parentGrants,
      });
      await makeParent(b, other);
      await su.query(`UPDATE membership SET user_id = $1, status = 'DISABLED' WHERE id = $2`, [
        parent.userId,
        other.membershipId,
      ]);
      const s = toSession(await login(HUB, parent.email));
      const res = await me(HUB, s);
      const academies = (res.body as { hub: { academies: { slug: string }[] } }).hub.academies;
      expect(academies.map((x) => x.slug)).toEqual([a.slug]);
      expect(JSON.stringify(res.body)).not.toContain(b.slug);
    });

    it('a HUB session is refused on academy and console hosts', async () => {
      const s = toSession(await login(HUB, parent.email));
      for (const h of [host(a), host(b), CONSOLE]) expect((await me(h, s)).status, h).toBe(401);
    });
  });

  describe('console (C-02, C-66)', () => {
    let adminEmail: string;
    let link: string;
    const consoleLogin = (password = ADMIN_PASSWORD) => login(CONSOLE, adminEmail, password);

    beforeAll(async () => {
      adminEmail = `admin-${Date.now()}@academybees.test`;
      const env = {
        APP_ENV: 'ci',
        PLATFORM_DATABASE_URL: urls.platform,
        SECRETS_MASTER_KEY: testConfig().SECRETS_MASTER_KEY,
      };
      ({ link } = await createAdmin({ email: adminEmail, name: 'Console Admin' }, env));
    });

    it('create-admin issues a console set-password link, audited, with the email queued', async () => {
      expect(link).toMatch(/^http:\/\/console\.localhost:3000\/set-password#token=[\w-]{43}$/);
      const { rows: audit } = await su.query(
        `SELECT a.tenant_id FROM audit_log a JOIN "user" u ON u.id::text = a.entity_id
          WHERE a.action = 'platform.staff_created' AND u.email = $1`,
        [adminEmail],
      );
      expect(audit).toEqual([{ tenant_id: null }]);
      const { rows: mail } = await su.query(
        `SELECT payload FROM outbox_event WHERE payload->>'to' = $1`,
        [adminEmail],
      );
      expect(mail[0].payload).toMatchObject({
        template: 'platform_admin_invite',
        host: { kind: 'console' },
      });
      expect(JSON.stringify(mail[0].payload)).not.toContain(link.split('#token=').pop());
      await expect(
        createAdmin(
          { email: adminEmail },
          {
            APP_ENV: 'ci',
            PLATFORM_DATABASE_URL: urls.platform,
            SECRETS_MASTER_KEY: testConfig().SECRETS_MASTER_KEY,
          },
        ),
      ).rejects.toThrow(/already platform staff/);
    });

    it('the link sets the password on the console host; staff cannot sign in before', async () => {
      expect((await consoleLogin()).status).toBe(401);
      const token = link.split('#token=').pop()!;
      const res = await http()
        .post('/api/v1/auth/password/reset')
        .set('Host', CONSOLE)
        .send({ token, password: ADMIN_PASSWORD });
      expect(res.status).toBe(204);
    });

    let secret = '';
    let recoveryCodes: string[] = [];

    it('first sign-in: no session, an enrol step; enrolment confirms a code and signs in', async () => {
      const res = await consoleLogin();
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ mfa: { step: 'enrol', token: expect.any(String) } });
      expect(res.headers['set-cookie']).toBeUndefined();
      const token = res.body.mfa.token as string;

      const start = await http()
        .post('/api/v1/auth/mfa/enrol/start')
        .set('Host', CONSOLE)
        .send({ token });
      expect(start.status).toBe(200);
      expect(start.body.qrSvgDataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
      secret = (start.body.manualKey as string).replace(/\s/g, '');

      const wrong = await http()
        .post('/api/v1/auth/mfa/enrol/confirm')
        .set('Host', CONSOLE)
        .send({ token, code: '000000' });
      expect(wrong.status).toBe(401);

      const confirm = await http()
        .post('/api/v1/auth/mfa/enrol/confirm')
        .set('Host', CONSOLE)
        .send({ token, code: totpCode(secret) });
      expect(confirm.status).toBe(200);
      recoveryCodes = confirm.body.recoveryCodes as string[];
      expect(recoveryCodes).toHaveLength(10);
      const s = toSession(confirm);
      const mine = await me(CONSOLE, s);
      expect(mine.body).toMatchObject({ audience: 'CONSOLE', platform: { role: 'SUPER_ADMIN' } });

      const { rows } = await su.query(
        `SELECT secret_encrypted FROM mfa_factor f JOIN "user" u ON u.id = f.user_id WHERE u.email = $1`,
        [adminEmail],
      );
      expect(rows[0].secret_encrypted).toMatch(/^ab1\./);
      expect(rows[0].secret_encrypted).not.toContain(secret);
    });

    it('later sign-ins need a code: a replayed step is refused, a recovery code works once', async () => {
      const step = (await consoleLogin()).body.mfa as { step: string; token: string };
      expect(step.step).toBe('verify');
      // The enrolment already used the current time step.
      const replay = await http()
        .post('/api/v1/auth/mfa/verify')
        .set('Host', CONSOLE)
        .send({ token: step.token, code: totpCode(secret) });
      expect(replay.status).toBe(401);

      const recovered = await http()
        .post('/api/v1/auth/mfa/verify')
        .set('Host', CONSOLE)
        .send({ token: step.token, recoveryCode: recoveryCodes[0] });
      expect(recovered.status).toBe(200);
      expect((await me(CONSOLE, toSession(recovered))).status).toBe(200);

      const next = (await consoleLogin()).body.mfa as { token: string };
      const reused = await http()
        .post('/api/v1/auth/mfa/verify')
        .set('Host', CONSOLE)
        .send({ token: next.token, recoveryCode: recoveryCodes[0] });
      expect(reused.status).toBe(401);
    });

    it('an MFA token dies after 5 wrong codes, and works only on the console', async () => {
      const { token } = (await consoleLogin()).body.mfa as { token: string };
      const elsewhere = await http()
        .post('/api/v1/auth/mfa/verify')
        .set('Host', HUB)
        .send({ token, code: '000000' });
      expect(elsewhere.status).toBe(404);
      for (let i = 0; i < 5; i++)
        await http()
          .post('/api/v1/auth/mfa/verify')
          .set('Host', CONSOLE)
          .send({ token, recoveryCode: `wrong-${i}aa` });
      const dead = await http()
        .post('/api/v1/auth/mfa/verify')
        .set('Host', CONSOLE)
        .send({ token, recoveryCode: recoveryCodes[1] });
      expect(dead.status).toBe(401);
      expect(dead.body.error.code).toBe('SESSION_EXPIRED');
    });

    it('academy staff and parents get the wrong-password answer on the console', async () => {
      for (const email of [a.user.email, parent.email]) {
        const res = await login(CONSOLE, email);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      }
    });

    it('a console session is refused on academy and hub hosts; disabling staff ends it', async () => {
      const { token } = (await consoleLogin()).body.mfa as { token: string };
      const res = await http()
        .post('/api/v1/auth/mfa/verify')
        .set('Host', CONSOLE)
        .send({ token, recoveryCode: recoveryCodes[2] });
      const s = toSession(res);
      for (const h of [host(a), HUB]) expect((await me(h, s)).status, h).toBe(401);
      expect((await me(CONSOLE, s)).status).toBe(200);
      await su.query(
        `UPDATE platform_staff SET status = 'DISABLED' WHERE user_id = (SELECT id FROM "user" WHERE email = $1)`,
        [adminEmail],
      );
      try {
        expect((await me(CONSOLE, s)).status).toBe(401);
      } finally {
        await su.query(
          `UPDATE platform_staff SET status = 'ACTIVE' WHERE user_id = (SELECT id FROM "user" WHERE email = $1)`,
          [adminEmail],
        );
      }
    });

    it('a forged token of another audience is refused on the console and hub', async () => {
      const keys = app.get<KeyRing>(AUTH_KEYS);
      for (const [h, aud] of [
        [CONSOLE, 'TENANT'],
        [CONSOLE, 'HUB'],
        [HUB, 'CONSOLE'],
        [HUB, 'TENANT'],
      ] as const) {
        const token = await signAccessToken(
          {
            sub: a.user.id,
            sid: a.user.id,
            aud,
            ...(aud === 'TENANT' ? { tid: a.id } : {}),
            ver: 1,
          },
          keys,
        );
        const res = await http()
          .get('/api/v1/auth/me')
          .set('Host', h)
          .set('Cookie', `ab_at=${token}`);
        expect(res.status, `${aud} on ${h}`).toBe(401);
      }
    });
  });

  describe('console IP allow-list (C-66)', () => {
    it('outside the allow-list the console host answers 404 on every route', async () => {
      const locked = await createTestApp(testConfig({ CONSOLE_IP_ALLOWLIST: '203.0.113.0/24' }));
      try {
        const res = await request(locked.getHttpServer())
          .post('/api/v1/auth/login')
          .set('Host', CONSOLE)
          .send({ identifier: 'x@example.test', password: 'x' });
        expect(res.status).toBe(404);
        // Academy hosts are unaffected.
        const academy = await request(locked.getHttpServer())
          .get('/api/v1/tenant/context')
          .set('Host', host(a));
        expect(academy.status).toBe(200);
      } finally {
        await locked.close();
      }
    });

    it('inside the allow-list the console works', async () => {
      const open = await createTestApp(
        testConfig({ CONSOLE_IP_ALLOWLIST: '127.0.0.1,::1,203.0.113.0/24' }),
      );
      try {
        const res = await request(open.getHttpServer())
          .post('/api/v1/auth/login')
          .set('Host', CONSOLE)
          .send({ identifier: 'nobody@example.test', password: 'Wrong#Pass2026' });
        expect(res.status).toBe(401);
      } finally {
        await open.close();
      }
    });

    it('rejects malformed allow-list entries at boot', () => {
      expect(() => testConfig({ CONSOLE_IP_ALLOWLIST: 'not-an-ip' })).toThrow(
        /CONSOLE_IP_ALLOWLIST/,
      );
    });
  });
});
