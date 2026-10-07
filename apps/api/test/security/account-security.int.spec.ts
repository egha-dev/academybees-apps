import { totpCode } from '@academybee/auth';
import { ROLE_TEMPLATES } from '@academybee/contracts';
import {
  addMemberFixture,
  createTenantFixture,
  FIXTURE_PASSWORD,
  type Grant,
  type MemberFixture,
  type TenantFixture,
} from '@academybee/testing';
import { type INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { MembershipService } from '../../src/core/auth/membership.service.js';
import { createTestApp } from '../support/test-app.js';

/**
 * Account security for academy users (plan 2.21, 2.22; G-11, C-80): 2FA at sign-in on every host,
 * the academy's 2FA rule, setting 2FA up and off, recovery codes, password change, devices and
 * sessions, and new-device alerts. Cookie names are the insecure-dev ones (C-64).
 */
const urls = inject('databaseUrls');
const HUB = 'app.localhost';
const NEW_PASSWORD = 'Harbour#Lantern2026';
const grantsOf = (key: keyof typeof ROLE_TEMPLATES): Grant[] =>
  Object.entries(ROLE_TEMPLATES[key].grants).map(([capability, scope]) => ({ capability, scope }));

type Session = { cookie: string; csrf: string };

const toSession = (res: request.Response, device?: string): Session => {
  const pairs = ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .map((c) => c.split(';')[0]!)
    .filter((p) => !p.startsWith('ab_dev='));
  if (device) pairs.push(`ab_dev=${device}`);
  return {
    cookie: pairs.join('; '),
    csrf: pairs.find((p) => p.startsWith('ab_csrf='))?.slice('ab_csrf='.length) ?? '',
  };
};
const deviceOf = (res: request.Response): string | undefined =>
  ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .find((c) => c.startsWith('ab_dev='))
    ?.split(';')[0]!
    .slice('ab_dev='.length);

describe('account security', () => {
  let app: INestApplication;
  let a: TenantFixture;
  let b: TenantFixture;
  let su: pg.Client;
  const http = () => request(app.getHttpServer());
  const host = (t: TenantFixture) => `${t.slug}.localhost`;

  const login = (h: string, identifier: string, password = FIXTURE_PASSWORD, device?: string) => {
    const req = http().post('/api/v1/auth/login').set('Host', h);
    if (device) req.set('Cookie', `ab_dev=${device}`);
    return req.send({ identifier, password });
  };
  const signIn = async (t: TenantFixture, email: string, password = FIXTURE_PASSWORD) => {
    const res = await login(host(t), email, password);
    expect(res.status, 'sign-in').toBe(200);
    expect(res.body.mfa, 'no 2FA step expected').toBeUndefined();
    return toSession(res);
  };
  const get = (t: TenantFixture, s: Session, path: string) =>
    http().get(`/api/v1${path}`).set('Host', host(t)).set('Cookie', s.cookie);
  const post = (t: TenantFixture, s: Session, path: string, body: object = {}) =>
    http()
      .post(`/api/v1${path}`)
      .set('Host', host(t))
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .send(body);
  const patch = (t: TenantFixture, s: Session, path: string, body: object) =>
    http()
      .patch(`/api/v1${path}`)
      .set('Host', host(t))
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .send(body);
  const mfa = (h: string, path: string, body: object) =>
    http().post(`/api/v1/auth/mfa/${path}`).set('Host', h).send(body);

  /** Let the same TOTP step be used again (the replay guard is tested on its own). */
  const allowStepAgain = (userId: string) =>
    su.query(`UPDATE mfa_factor SET last_step = NULL WHERE user_id = $1`, [userId]);

  /** Turn on 2FA while signed in; returns the secret and recovery codes. */
  const enableMfa = async (t: TenantFixture, s: Session, password = FIXTURE_PASSWORD) => {
    const start = await post(t, s, '/auth/mfa/setup/start', { password });
    expect(start.status, 'setup start').toBe(200);
    const secret = (start.body.manualKey as string).replace(/\s/g, '');
    const confirm = await post(t, s, '/auth/mfa/setup/confirm', { code: totpCode(secret) });
    expect(confirm.status, 'setup confirm').toBe(200);
    return { secret, recoveryCodes: confirm.body.recoveryCodes as string[] };
  };

  const emails = async (to: string, template: string) => {
    const { rows } = await su.query<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM outbox_event WHERE type = 'email.requested'
         AND payload->>'to' = $1 AND payload->>'template' = $2 ORDER BY created_at, id`,
      [to, template],
    );
    return rows.map((r) => r.payload);
  };

  const member = async (t: TenantFixture, role: 'accountant' | 'teacher' | 'parent' | 'owner') => {
    const tag = crypto.randomUUID().slice(0, 8);
    const m = await addMemberFixture(urls.migrator, t.id, {
      email: `${role}-${tag}-${t.slug}@example.test`,
      roleKey: `${role}-${tag}`,
      grants: grantsOf(role),
    });
    await su.query(`UPDATE membership_role SET role_id = $1 WHERE membership_id = $2`, [
      t.roleIds[role],
      m.membershipId,
    ]);
    return m;
  };

  const setRule = (t: TenantFixture, roles: string[]) =>
    su.query(`UPDATE tenant_settings SET security = $1 WHERE tenant_id = $2`, [
      JSON.stringify({ requireMfaForRoles: roles }),
      t.id,
    ]);

  beforeAll(async () => {
    [a, b] = await Promise.all([
      createTenantFixture(urls.migrator, { name: 'Security Academy A' }),
      createTenantFixture(urls.migrator, { name: 'Security Academy B' }),
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
  });

  describe('set up 2FA', () => {
    let accountant: MemberFixture;
    let s: Session;
    beforeAll(async () => {
      accountant = await member(a, 'accountant');
      s = await signIn(a, accountant.email);
    });

    it('an accountant without 2FA lands on the strong prompt and the overview recommends it', async () => {
      const res = await login(host(a), accountant.email);
      expect(res.body.redirectTo).toBe('/settings/security?prompt=mfa');
      const overview = await get(a, s, '/auth/security');
      expect(overview.status).toBe(200);
      expect(overview.body).toMatchObject({
        mfa: { enabled: false, recoveryCodesLeft: 0, required: false, recommended: true },
        password: { updatedAt: expect.any(String) },
      });
    });

    it('needs the current password, then a correct code; ten recovery codes are shown once', async () => {
      const wrong = await post(a, s, '/auth/mfa/setup/start', { password: 'Wrong#Pass2026' });
      expect(wrong.status).toBe(401);
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
      // A wrong re-entered password doesn't count towards the sign-in lock.
      const { rows } = await su.query(
        `SELECT failed_count FROM user_credential WHERE user_id = $1`,
        [accountant.userId],
      );
      expect(rows[0].failed_count).toBe(0);

      const start = await post(a, s, '/auth/mfa/setup/start', { password: FIXTURE_PASSWORD });
      expect(start.status).toBe(200);
      expect(start.body.qrSvgDataUrl).toMatch(/^data:image\/svg\+xml/);
      const secret = (start.body.manualKey as string).replace(/\s/g, '');
      const bad = await post(a, s, '/auth/mfa/setup/confirm', { code: '000000' });
      expect(bad.status).toBe(401);
      const ok = await post(a, s, '/auth/mfa/setup/confirm', { code: totpCode(secret) });
      expect(ok.status).toBe(200);
      expect(ok.body.recoveryCodes).toHaveLength(10);

      const overview = await get(a, s, '/auth/security');
      expect(overview.body.mfa).toMatchObject({
        enabled: true,
        recoveryCodesLeft: 10,
        recommended: false,
      });
      const again = await post(a, s, '/auth/mfa/setup/start', { password: FIXTURE_PASSWORD });
      expect(again.status).toBe(409);

      const { rows: audit } = await su.query(
        `SELECT tenant_id FROM audit_log WHERE action = 'auth.mfa_enrolled' AND entity_id = $1`,
        [accountant.userId],
      );
      expect(audit).toEqual([{ tenant_id: a.id }]);
      const { rows: events } = await su.query(
        `SELECT payload FROM outbox_event WHERE payload->>'name' = 'auth.mfa_enabled' AND tenant_id = $1`,
        [a.id],
      );
      expect(events[0].payload.properties).toEqual({ required: false });
      // This session counts as verified.
      const { rows: sessions } = await su.query(
        `SELECT count(*)::int AS n FROM auth_session WHERE user_id = $1 AND revoked_at IS NULL AND mfa_verified_at IS NOT NULL`,
        [accountant.userId],
      );
      expect(sessions[0].n).toBe(1);
    });
  });

  describe('mfa token', () => {
    let owner: MemberFixture;
    let secret: string;
    let recoveryCodes: string[];
    beforeAll(async () => {
      owner = await member(a, 'owner');
      ({ secret, recoveryCodes } = await enableMfa(a, await signIn(a, owner.email)));
    });

    it('with 2FA, a correct password gets a verify step and no cookies', async () => {
      const res = await login(host(a), owner.email);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ mfa: { step: 'verify', token: expect.any(String) } });
      expect(
        ([] as string[])
          .concat(res.headers['set-cookie'] ?? [])
          .filter((c) => /^ab_(at|rt)=/.test(c)),
      ).toEqual([]);
    });

    it('the token works only on the academy that issued it', async () => {
      const { token } = (await login(host(a), owner.email)).body.mfa as { token: string };
      for (const h of [host(b), HUB, 'console.localhost']) {
        const res = await mfa(h, 'verify', { token, recoveryCode: recoveryCodes[0] });
        expect(res.status, h).toBe(404);
      }
      // Still usable where it belongs: nothing was consumed elsewhere.
      await allowStepAgain(owner.userId);
      const ok = await mfa(host(a), 'verify', { token, code: totpCode(secret) });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ experience: 'manage', redirectTo: '/today' });
      const s = toSession(ok);
      expect((await get(a, s, '/auth/me')).status).toBe(200);
      const { rows } = await su.query(
        `SELECT mfa_verified_at FROM auth_session WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [owner.userId],
      );
      expect(rows[0].mfa_verified_at).not.toBeNull();
    });

    it('a code may not be replayed, and enrolment is refused for an enrolled user', async () => {
      await allowStepAgain(owner.userId);
      const first = (await login(host(a), owner.email)).body.mfa as { token: string };
      expect(
        (await mfa(host(a), 'verify', { token: first.token, code: totpCode(secret) })).status,
      ).toBe(200);
      const second = (await login(host(a), owner.email)).body.mfa as { token: string };
      expect(
        (await mfa(host(a), 'verify', { token: second.token, code: totpCode(secret) })).status,
      ).toBe(401);
      expect((await mfa(host(a), 'enrol/start', { token: second.token })).status).toBe(409);
    });

    it('a parent with 2FA verifies on the academy, then continues to the hub', async () => {
      const parent = await member(a, 'parent');
      // Parents have no Security page yet (7P): set 2FA up while briefly staff.
      await su.query(`UPDATE membership_role SET role_id = $1 WHERE membership_id = $2`, [
        a.roleIds.accountant,
        parent.membershipId,
      ]);
      const s = await signIn(a, parent.email);
      const { secret: parentSecret } = await enableMfa(a, s);
      await su.query(`UPDATE membership_role SET role_id = $1 WHERE membership_id = $2`, [
        a.roleIds.parent,
        parent.membershipId,
      ]);
      await app.get(MembershipService).invalidate(a.id, parent.userId);

      await allowStepAgain(parent.userId);
      const step = (await login(host(a), parent.email)).body.mfa as { token: string };
      const verified = await mfa(host(a), 'verify', {
        token: step.token,
        code: totpCode(parentSecret),
      });
      expect(verified.status).toBe(200);
      expect(verified.body).toEqual({ handoff: { code: expect.any(String) } });

      // Signing in on the hub directly also asks for the code.
      await allowStepAgain(parent.userId);
      const hub = await login(HUB, parent.email);
      expect(hub.body).toEqual({ mfa: { step: 'verify', token: expect.any(String) } });
      const hubSession = await mfa(HUB, 'verify', {
        token: hub.body.mfa.token,
        code: totpCode(parentSecret),
      });
      expect(hubSession.status).toBe(200);
      expect(hubSession.body).toMatchObject({ experience: 'hub' });
    });
  });

  describe('the academy 2FA rule', () => {
    it('settings: read, change with the version, and only once the changer uses 2FA', async () => {
      const owner = await signIn(b, b.user.email);
      const read = await get(b, owner, '/settings/security');
      expect(read.status).toBe(200);
      expect(read.body).toEqual({ requireMfaForRoles: [], version: 1 });

      const own = await patch(b, owner, '/settings/security', {
        version: 1,
        requireMfaForRoles: ['owner', 'accountant'],
      });
      expect(own.status).toBe(409);
      expect(own.body.error.details).toEqual([
        { path: 'requireMfaForRoles', issue: 'mfa_not_enabled' },
      ]);

      // A rule that doesn't cover the changer's own roles is fine without 2FA.
      const ok = await patch(b, owner, '/settings/security', {
        version: 1,
        requireMfaForRoles: ['accountant'],
      });
      expect(ok.status).toBe(200);
      expect(ok.body).toEqual({ requireMfaForRoles: ['accountant'], version: 2 });
      const stale = await patch(b, owner, '/settings/security', {
        version: 1,
        requireMfaForRoles: [],
      });
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe('VERSION_CONFLICT');
      const { rows } = await su.query(
        `SELECT before, after FROM audit_log WHERE action = 'academy.security_settings_changed' AND tenant_id = $1`,
        [b.id],
      );
      expect(rows).toEqual([
        { before: { requireMfaForRoles: [] }, after: { requireMfaForRoles: ['accountant'] } },
      ]);
      await setRule(b, []);
    });

    it('a member whose role requires 2FA must enrol before any session; 2FA then stays on', async () => {
      const accountant = await member(a, 'accountant');
      const earlier = await signIn(a, accountant.email);
      await setRule(a, ['accountant']);
      try {
        // A session from before the rule ends at its next refresh.
        const refreshed = await post(a, earlier, '/auth/refresh');
        expect(refreshed.status).toBe(401);

        const res = await login(host(a), accountant.email);
        expect(res.body).toEqual({ mfa: { step: 'enrol', token: expect.any(String) } });
        const token = res.body.mfa.token as string;
        const start = await mfa(host(a), 'enrol/start', { token });
        expect(start.status).toBe(200);
        const secret = (start.body.manualKey as string).replace(/\s/g, '');
        const confirm = await mfa(host(a), 'enrol/confirm', { token, code: totpCode(secret) });
        expect(confirm.status).toBe(200);
        expect(confirm.body).toMatchObject({ experience: 'manage', redirectTo: '/today' });
        expect(confirm.body.recoveryCodes).toHaveLength(10);

        const s = toSession(confirm);
        const overview = await get(a, s, '/auth/security');
        expect(overview.body.mfa).toMatchObject({ enabled: true, required: true });
        const off = await post(a, s, '/auth/mfa/disable', { password: FIXTURE_PASSWORD });
        expect(off.status).toBe(409);
        expect(off.body.error.details).toEqual([{ path: 'mfa', issue: 'required_by_academy' }]);
        // A verified session survives refresh under the rule.
        expect((await post(a, s, '/auth/refresh')).status).toBe(204);
      } finally {
        await setRule(a, []);
      }
    });

    it('a rule in academy A changes nothing in academy B', async () => {
      const accountantB = await member(b, 'accountant');
      await setRule(a, ['accountant']);
      try {
        const res = await login(host(b), accountantB.email);
        expect(res.status).toBe(200);
        expect(res.body.mfa).toBeUndefined();
      } finally {
        await setRule(a, []);
      }
    });
  });

  describe('recovery codes', () => {
    it('new codes need the password and replace the old ones', async () => {
      const teacher = await member(a, 'teacher');
      const s = await signIn(a, teacher.email);
      const { recoveryCodes: old } = await enableMfa(a, s);
      const wrong = await post(a, s, '/auth/mfa/recovery-codes', { password: 'Wrong#Pass2026' });
      expect(wrong.status).toBe(401);
      const fresh = await post(a, s, '/auth/mfa/recovery-codes', { password: FIXTURE_PASSWORD });
      expect(fresh.status).toBe(200);
      const codes = fresh.body.recoveryCodes as string[];
      expect(codes).toHaveLength(10);

      const step = (await login(host(a), teacher.email)).body.mfa as { token: string };
      expect(
        (await mfa(host(a), 'verify', { token: step.token, recoveryCode: old[0] })).status,
      ).toBe(401);
      expect(
        (await mfa(host(a), 'verify', { token: step.token, recoveryCode: codes[0] })).status,
      ).toBe(200);
      const overview = await get(a, s, '/auth/security');
      expect(overview.body.mfa.recoveryCodesLeft).toBe(9);
    });
  });

  describe('turn 2FA off', () => {
    it('needs the password, signs out other devices, sends an alert; sign-in asks no code', async () => {
      const teacher = await member(a, 'teacher');
      const s = await signIn(a, teacher.email);
      const { secret } = await enableMfa(a, s);
      await allowStepAgain(teacher.userId);
      const step = (await login(host(a), teacher.email)).body.mfa as { token: string };
      const elsewhere = toSession(
        await mfa(host(a), 'verify', { token: step.token, code: totpCode(secret) }),
      );
      expect((await post(a, s, '/auth/mfa/disable', { password: 'Wrong#Pass2026' })).status).toBe(
        401,
      );
      const off = await post(a, s, '/auth/mfa/disable', { password: FIXTURE_PASSWORD });
      expect(off.status).toBe(204);
      // Other devices (verified with the old factor) are signed out; this one stays.
      expect((await get(a, elsewhere, '/auth/me')).status).toBe(401);
      expect((await get(a, s, '/auth/me')).status).toBe(200);
      const sent = await emails(teacher.email, 'mfa_disabled');
      expect(sent).toHaveLength(1);
      expect(sent[0]!.host).toEqual({ kind: 'academy', slug: a.slug });
      const res = await login(host(a), teacher.email);
      expect(res.status).toBe(200);
      expect(res.body.mfa).toBeUndefined();
      const { rows } = await su.query(
        `SELECT count(*)::int AS n FROM mfa_recovery_code WHERE user_id = $1`,
        [teacher.userId],
      );
      expect(rows[0].n).toBe(0);
    });
  });

  describe('change password', () => {
    it('checks the current password and the policy, signs out other devices and sends the alert', async () => {
      const teacher = await member(a, 'teacher');
      const here = await signIn(a, teacher.email);
      const other = await signIn(a, teacher.email);

      const wrong = await post(a, here, '/auth/password/change', {
        currentPassword: 'Wrong#Pass2026',
        newPassword: NEW_PASSWORD,
      });
      expect(wrong.status).toBe(401);
      const weak = await post(a, here, '/auth/password/change', {
        currentPassword: FIXTURE_PASSWORD,
        newPassword: 'short',
      });
      expect(weak.status).toBe(400);
      const same = await post(a, here, '/auth/password/change', {
        currentPassword: FIXTURE_PASSWORD,
        newPassword: FIXTURE_PASSWORD,
      });
      expect(same.status).toBe(400);

      const ok = await post(a, here, '/auth/password/change', {
        currentPassword: FIXTURE_PASSWORD,
        newPassword: NEW_PASSWORD,
      });
      expect(ok.status).toBe(204);
      expect((await get(a, here, '/auth/me')).status).toBe(200);
      expect((await get(a, other, '/auth/me')).status).toBe(401);
      expect(await emails(teacher.email, 'password_changed')).toHaveLength(1);
      expect((await login(host(a), teacher.email)).status).toBe(401);
      expect((await login(host(a), teacher.email, NEW_PASSWORD)).status).toBe(200);
    });
  });

  describe('sessions', () => {
    it('lists this academy’s devices, signs out one and all others; never another user’s', async () => {
      const teacher = await member(a, 'teacher');
      const phone = toSession(
        await http()
          .post('/api/v1/auth/login')
          .set('Host', host(a))
          .set(
            'User-Agent',
            'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36',
          )
          .send({ identifier: teacher.email, password: FIXTURE_PASSWORD }),
      );
      const laptop = await signIn(a, teacher.email);
      const third = await signIn(a, teacher.email);

      const list = await get(a, laptop, '/auth/sessions');
      expect(list.status).toBe(200);
      const items = list.body.items as Array<{ id: string; device: string; current: boolean }>;
      expect(items).toHaveLength(3);
      expect(items.filter((i) => i.current)).toHaveLength(1);
      expect(items.map((i) => i.device)).toContain('chrome/android');
      expect(JSON.stringify(list.body)).not.toMatch(/127\.0\.0\.1|::1|userAgent|ip/);

      const phoneId = items.find((i) => i.device === 'chrome/android')!.id;
      // Another user's session is not found.
      const stranger = await signIn(a, a.user.email);
      expect((await post(a, stranger, `/auth/sessions/${phoneId}/revoke`)).status).toBe(404);
      expect((await post(a, laptop, '/auth/sessions/not-a-uuid/revoke')).status).toBe(404);

      expect((await post(a, laptop, `/auth/sessions/${phoneId}/revoke`)).status).toBe(204);
      expect((await get(a, phone, '/auth/me')).status).toBe(401);
      expect((await post(a, phone, '/auth/refresh')).status).toBe(401);

      const others = await post(a, laptop, '/auth/sessions/revoke-others');
      expect(others.status).toBe(200);
      expect(others.body).toEqual({ revoked: 1 });
      expect((await get(a, third, '/auth/me')).status).toBe(401);
      expect((await get(a, laptop, '/auth/me')).status).toBe(200);
    });

    it('sessions in another academy are neither listed nor revocable here', async () => {
      const teacher = await member(a, 'teacher');
      // The same person is also a teacher at B.
      const atB = await member(b, 'teacher');
      await su.query(`UPDATE membership SET user_id = $1 WHERE id = $2`, [
        teacher.userId,
        atB.membershipId,
      ]);
      const sA = await signIn(a, teacher.email);
      const sB = await signIn(b, teacher.email);
      const listA = (await get(a, sA, '/auth/sessions')).body.items as Array<{ id: string }>;
      const listB = (await get(b, sB, '/auth/sessions')).body.items as Array<{ id: string }>;
      expect(listA).toHaveLength(1);
      expect(listB).toHaveLength(1);
      expect((await post(a, sA, `/auth/sessions/${listB[0]!.id}/revoke`)).status).toBe(404);
      expect((await post(a, sA, '/auth/sessions/revoke-others')).body).toEqual({ revoked: 0 });
      expect((await get(b, sB, '/auth/me')).status).toBe(200);
    });
  });

  describe('new-device alerts', () => {
    it('no alert for the first device or a known one; an alert for a new one', async () => {
      const teacher = await member(a, 'teacher');
      const first = await login(host(a), teacher.email);
      const device = deviceOf(first);
      expect(device).toMatch(/^[\w-]{43}$/);
      expect(await emails(teacher.email, 'new_device')).toHaveLength(0);

      const known = await login(host(a), teacher.email, FIXTURE_PASSWORD, device);
      expect(deviceOf(known)).toBeUndefined();
      expect(await emails(teacher.email, 'new_device')).toHaveLength(0);

      await http()
        .post('/api/v1/auth/login')
        .set('Host', host(a))
        .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0) Gecko/20100101 Firefox/131.0')
        .send({ identifier: teacher.email, password: FIXTURE_PASSWORD });
      const sent = await emails(teacher.email, 'new_device');
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        template: 'new_device',
        host: { kind: 'academy', slug: a.slug },
        vars: { browser: 'firefox', os: 'windows' },
      });
      const { rows } = await su.query(
        `SELECT device_id_hash FROM known_device WHERE user_id = $1`,
        [teacher.userId],
      );
      expect(rows).toHaveLength(2);
      expect(JSON.stringify(rows)).not.toContain(device!);
    });
  });
});
