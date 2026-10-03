import { decryptSecret, type MasterKeyRing } from '@academybee/auth';
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

import { MASTER_KEYS } from '../../src/core/auth/keys.js';
import { createTestApp } from '../support/test-app.js';

/**
 * Team, invitations and password recovery (Phase 2, C-67): privilege escalation, single-use
 * links, cross-academy links, and the rules the cross-tenant suite cannot repeat.
 */
const urls = inject('databaseUrls');
const NEW_PASSWORD = 'Brand-New#Pass2026';

type Session = { cookie: string; csrf: string };

const templateGrants = (key: keyof typeof ROLE_TEMPLATES): Grant[] =>
  Object.entries(ROLE_TEMPLATES[key].grants).map(([capability, scope]) => ({ capability, scope }));

describe('team, invitations and password recovery', () => {
  let app: INestApplication;
  let a: TenantFixture;
  let b: TenantFixture;
  let admin: MemberFixture;
  let su: pg.Client;
  const host = (t: TenantFixture) => `${t.slug}.localhost`;
  const http = () => request(app.getHttpServer());

  const toSession = (res: request.Response): Session => {
    const pairs = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .map((c) => c.split(';')[0]!);
    return {
      cookie: pairs.join('; '),
      csrf: pairs.find((p) => p.startsWith('ab_csrf='))?.slice('ab_csrf='.length) ?? '',
    };
  };
  const login = (t: TenantFixture, identifier: string, password = FIXTURE_PASSWORD) =>
    http().post('/api/v1/auth/login').set('Host', host(t)).send({ identifier, password });
  const signIn = async (t: TenantFixture, email: string, password = FIXTURE_PASSWORD) => {
    const res = await login(t, email, password);
    expect(res.status, `sign-in ${email}`).toBe(200);
    return toSession(res);
  };
  /** Sign in first: supertest binds its server when a request is created. */
  const as = async (t: TenantFixture, email: string) => {
    const s = await signIn(t, email);
    const withSession = (req: request.Test) =>
      req.set('Host', host(t)).set('Cookie', s.cookie).set('x-csrf-token', s.csrf);
    return {
      get: (path: string) => withSession(http().get(path)),
      post: (path: string, body: object = {}, key?: string) =>
        withSession(http().post(path))
          .set('Idempotency-Key', key ?? crypto.randomUUID())
          .send(body),
      patch: (path: string, body: object) => withSession(http().patch(path)).send(body),
    };
  };

  /** The newest email of a template to an address, with its link token opened (as the worker does). */
  const lastEmail = async (to: string, template: string) => {
    const { rows } = await su.query<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM outbox_event WHERE type = 'email.requested'
         AND payload->>'to' = $1 AND payload->>'template' = $2 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [to, template],
    );
    const payload = rows[0]?.payload as
      | { host: { kind: string; slug?: string }; link?: { path: string; sealedToken: string } }
      | undefined;
    if (!payload) return undefined;
    const token = payload.link
      ? decryptSecret(payload.link.sealedToken, app.get<MasterKeyRing>(MASTER_KEYS))
      : undefined;
    return { payload, token };
  };
  const emailCount = async (to: string) =>
    Number(
      (
        await su.query<{ n: string }>(
          `SELECT count(*) AS n FROM outbox_event WHERE type = 'email.requested' AND payload->>'to' = $1`,
          [to],
        )
      ).rows[0]!.n,
    );

  beforeAll(async () => {
    [a, b] = await Promise.all([
      createTenantFixture(urls.migrator, { name: 'Team Academy A' }),
      createTenantFixture(urls.migrator, { name: 'Team Academy B' }),
    ]);
    admin = await addMemberFixture(urls.migrator, a.id, {
      email: `admin-${a.slug}@example.test`,
      roleKey: 'admin',
      grants: templateGrants('admin'),
    });
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

  describe('invitations', () => {
    it('an owner invites a teacher; the email carries a sealed link to the academy subdomain', async () => {
      const owner = await as(a, a.user.email);
      const email = `teacher-${a.slug}@example.test`;
      const res = await owner.post('/api/v1/team/invitations', { email, roles: ['teacher'] });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ email, roles: ['teacher'], status: 'PENDING' });
      const sent = await lastEmail(email, 'invite');
      expect(sent?.payload.host).toEqual({ kind: 'academy', slug: a.slug });
      expect(sent?.payload.link?.path).toBe('/invite/{token}');
      expect(JSON.stringify(sent?.payload)).not.toContain(sent!.token!);
      const listed = await (await as(a, a.user.email)).get('/api/v1/team/invitations');
      const ids = (listed.body.invitations as Array<{ id: string }>).map((i) => i.id);
      expect(ids).toContain(res.body.id);
    });

    it('replays the same Idempotency-Key without a second invitation', async () => {
      const owner = await as(a, a.user.email);
      const body = { email: `idem-${a.slug}@example.test`, roles: ['receptionist'] };
      const key = crypto.randomUUID();
      const first = await owner.post('/api/v1/team/invitations', body, key);
      const again = await owner.post('/api/v1/team/invitations', body, key);
      expect(again.status).toBe(201);
      expect(again.body.id).toBe(first.body.id);
      expect(await emailCount(body.email)).toBe(1);
    });

    it('no privilege escalation: an admin cannot invite owners or accountants', async () => {
      const asAdmin = await as(a, admin.email);
      for (const role of ['owner', 'accountant']) {
        const res = await asAdmin.post('/api/v1/team/invitations', {
          email: `${role}-${a.slug}@example.test`,
          roles: [role],
        });
        expect(res.status, role).toBe(403);
      }
      const ok = await asAdmin.post('/api/v1/team/invitations', {
        email: `recept-${a.slug}@example.test`,
        roles: ['receptionist'],
      });
      expect(ok.status).toBe(201);
      const roles = await asAdmin.get('/api/v1/team/roles');
      const grantable = Object.fromEntries(
        (roles.body.roles as Array<{ key: string; grantable: boolean }>).map((r) => [
          r.key,
          r.grantable,
        ]),
      );
      expect(grantable).toMatchObject({ owner: false, accountant: false, teacher: true });
    });

    it('family roles cannot be granted through the team', async () => {
      const res = await (
        await as(a, a.user.email)
      ).post('/api/v1/team/invitations', { email: `p-${a.slug}@example.test`, roles: ['parent'] });
      expect(res.status).toBe(400);
    });

    it('an existing member cannot be invited again', async () => {
      const res = await (
        await as(a, a.user.email)
      ).post('/api/v1/team/invitations', { email: admin.email, roles: ['teacher'] });
      expect(res.status).toBe(409);
      expect(res.body.error.details).toEqual([{ path: 'email', issue: 'already_member' }]);
    });

    it('inviting the same email again replaces the earlier link', async () => {
      const email = `again-${a.slug}@example.test`;
      await (
        await as(a, a.user.email)
      ).post('/api/v1/team/invitations', { email, roles: ['teacher'] });
      const first = (await lastEmail(email, 'invite'))!.token!;
      await (
        await as(a, a.user.email)
      ).post('/api/v1/team/invitations', { email, roles: ['teacher'] });
      const second = (await lastEmail(email, 'invite'))!.token!;
      expect((await http().get(`/api/v1/invitations/${first}`).set('Host', host(a))).status).toBe(
        404,
      );
      expect((await http().get(`/api/v1/invitations/${second}`).set('Host', host(a))).status).toBe(
        200,
      );
    });

    it('revoke: the link stops working; revoking twice is not found', async () => {
      const email = `revoke-${a.slug}@example.test`;
      const created = await (
        await as(a, a.user.email)
      ).post('/api/v1/team/invitations', { email, roles: ['teacher'] });
      const token = (await lastEmail(email, 'invite'))!.token!;
      const path = `/api/v1/team/invitations/${created.body.id}/revoke`;
      expect((await (await as(a, a.user.email)).post(path)).status).toBe(204);
      expect((await http().get(`/api/v1/invitations/${token}`).set('Host', host(a))).status).toBe(
        404,
      );
      expect((await (await as(a, a.user.email)).post(path)).status).toBe(404);
    });
  });

  describe('accept', () => {
    it("academy A's invite link is not found on academy B's host", async () => {
      for (const res of [
        await http().get(`/api/v1/invitations/${a.invitationToken}`).set('Host', host(b)),
        await http()
          .post(`/api/v1/invitations/${a.invitationToken}/accept`)
          .set('Host', host(b))
          .send({ name: 'X', password: NEW_PASSWORD }),
      ]) {
        expect(res.status).toBe(404);
        expect(JSON.stringify(res.body)).not.toContain(a.id);
      }
    });

    it('a new person sets a name and password, joins ACTIVE with the roles and is signed in', async () => {
      const preview = await http()
        .get(`/api/v1/invitations/${a.invitationToken}`)
        .set('Host', host(a));
      expect(preview.body).toMatchObject({
        academy: { name: 'Team Academy A' },
        roles: ['teacher'],
        accountExists: false,
      });
      const weak = await http()
        .post(`/api/v1/invitations/${a.invitationToken}/accept`)
        .set('Host', host(a))
        .send({ name: 'Nila', password: 'short' });
      expect(weak.status).toBe(400);
      expect(weak.body.error.details).toContainEqual({ path: 'password', issue: 'too_short' });

      const res = await http()
        .post(`/api/v1/invitations/${a.invitationToken}/accept`)
        .set('Host', host(a))
        .send({ name: 'Nila', password: NEW_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        user: { name: 'Nila' },
        experience: 'teach',
        redirectTo: '/teach',
      });
      const me = await http()
        .get('/api/v1/auth/me')
        .set('Host', host(a))
        .set('Cookie', toSession(res).cookie);
      expect(me.body.academy.roles).toEqual(['teacher']);
      const { rows } = await su.query(`SELECT email_verified_at FROM "user" WHERE email = $1`, [
        `invitee-${a.slug}@example.test`,
      ]);
      expect(rows[0].email_verified_at).not.toBeNull();
      // Single use.
      const again = await http()
        .post(`/api/v1/invitations/${a.invitationToken}/accept`)
        .set('Host', host(a))
        .send({ name: 'Nila', password: NEW_PASSWORD });
      expect(again.status).toBe(404);
    });

    it('an existing AcademyBee user confirms with their current password', async () => {
      const owner = await as(a, a.user.email);
      await owner.post('/api/v1/team/invitations', {
        email: b.user.email,
        roles: ['receptionist'],
      });
      const token = (await lastEmail(b.user.email, 'invite'))!.token!;
      const preview = await http().get(`/api/v1/invitations/${token}`).set('Host', host(a));
      expect(preview.body.accountExists).toBe(true);
      const wrong = await http()
        .post(`/api/v1/invitations/${token}/accept`)
        .set('Host', host(a))
        .send({ password: 'Not-The-Password-1' });
      expect(wrong.status).toBe(401);
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
      const ok = await http()
        .post(`/api/v1/invitations/${token}/accept`)
        .set('Host', host(a))
        .send({ password: FIXTURE_PASSWORD });
      expect(ok.status).toBe(200);
      expect(ok.body.redirectTo).toBe('/today');
      // Still a member of B too; each academy keeps its own session.
      expect((await login(b, b.user.email)).status).toBe(200);
    });
  });

  describe('members', () => {
    let teacher: MemberFixture;
    beforeAll(async () => {
      teacher = await addMemberFixture(urls.migrator, a.id, {
        email: `t2-${a.slug}@example.test`,
        roleKey: 'teacher',
        grants: templateGrants('teacher'),
      });
    });

    const memberOf = async (membershipId: string) => {
      const list = await (await as(a, a.user.email)).get('/api/v1/team/members?limit=100');
      return (list.body.items as Array<{ id: string; version: number; isYou: boolean }>).find(
        (m) => m.id === membershipId,
      )!;
    };

    it('lists members with keyset pages', async () => {
      const owner = await as(a, a.user.email);
      const first = await owner.get('/api/v1/team/members?limit=1');
      expect(first.body.items).toHaveLength(1);
      expect(first.body.nextCursor).toEqual(expect.any(String));
      const next = await (
        await as(a, a.user.email)
      ).get(`/api/v1/team/members?limit=1&cursor=${first.body.nextCursor}`);
      expect(next.body.items[0].id).not.toBe(first.body.items[0].id);
      expect((await memberOf(a.user.membershipId)).isYou).toBe(true);
    });

    it('lists staff only: family members are not part of the team', async () => {
      const parent = await addMemberFixture(urls.migrator, a.id, {
        email: `family-${a.slug}@example.test`,
        roleKey: 'parent',
        grants: templateGrants('parent'),
      });
      await su.query(`UPDATE membership_role SET role_id = $1 WHERE membership_id = $2`, [
        a.roleIds.parent,
        parent.membershipId,
      ]);
      const list = await (await as(a, a.user.email)).get('/api/v1/team/members?limit=100');
      const ids = (list.body.items as Array<{ id: string }>).map((m) => m.id);
      expect(ids).toContain(teacher.membershipId);
      expect(ids).not.toContain(parent.membershipId);
    });

    it('nobody changes their own access', async () => {
      const me = await memberOf(a.user.membershipId);
      const res = await (
        await as(a, a.user.email)
      ).patch(`/api/v1/team/members/${a.user.membershipId}`, {
        version: me.version,
        status: 'DISABLED',
      });
      expect(res.status).toBe(403);
    });

    it('only owners change an owner', async () => {
      const owner = await memberOf(a.user.membershipId);
      const res = await (
        await as(a, admin.email)
      ).patch(`/api/v1/team/members/${a.user.membershipId}`, {
        version: owner.version,
        status: 'DISABLED',
      });
      expect(res.status).toBe(403);
    });

    it('a stale version is a conflict; a role change bumps the version', async () => {
      const before = await memberOf(teacher.membershipId);
      const stale = await (
        await as(a, a.user.email)
      ).patch(`/api/v1/team/members/${teacher.membershipId}`, {
        version: before.version + 5,
        roles: ['teacher', 'receptionist'],
      });
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe('VERSION_CONFLICT');
      const ok = await (
        await as(a, a.user.email)
      ).patch(`/api/v1/team/members/${teacher.membershipId}`, {
        version: before.version,
        roles: ['receptionist'],
      });
      expect(ok.status).toBe(200);
      expect(ok.body.version).toBe(before.version + 1);
      expect((ok.body.roles as Array<{ key: string }>).map((r) => r.key)).toEqual(['receptionist']);
    });

    it('disabling a member ends their sessions here at once', async () => {
      const session = await signIn(a, teacher.email);
      const me = () =>
        http().get('/api/v1/auth/me').set('Host', host(a)).set('Cookie', session.cookie);
      expect((await me()).status).toBe(200);
      const current = await memberOf(teacher.membershipId);
      const res = await (
        await as(a, a.user.email)
      ).patch(`/api/v1/team/members/${teacher.membershipId}`, {
        version: current.version,
        status: 'DISABLED',
      });
      expect(res.status).toBe(200);
      expect((await me()).status).toBe(401);
      expect((await login(a, teacher.email)).status).toBe(401);
    });
  });

  describe('password reset', () => {
    let member: MemberFixture;
    beforeAll(async () => {
      member = await addMemberFixture(urls.migrator, a.id, {
        email: `reset-${a.slug}@example.test`,
        roleKey: 'teacher',
        grants: templateGrants('teacher'),
      });
    });
    const forgot = (t: TenantFixture, email: string) =>
      http().post('/api/v1/auth/password/forgot').set('Host', host(t)).send({ email });
    const reset = (token: string, password = NEW_PASSWORD) =>
      http().post('/api/v1/auth/password/reset').set('Host', host(a)).send({ token, password });

    it('answers 202 for everyone, but emails only members of this academy', async () => {
      const unknown = await forgot(a, `nobody-${a.slug}@example.test`);
      const otherAcademy = await forgot(b, member.email);
      const real = await forgot(a, member.email);
      for (const res of [unknown, otherAcademy, real]) {
        expect(res.status).toBe(202);
        expect(res.body).toEqual({});
      }
      expect(await emailCount(`nobody-${a.slug}@example.test`)).toBe(0);
      const sent = await lastEmail(member.email, 'password_reset');
      expect(sent?.payload.host).toEqual({ kind: 'academy', slug: a.slug });
      expect(await emailCount(member.email)).toBe(1);
    });

    it('a reset sets the password, ends every session, alerts the user and is single use', async () => {
      const session = await signIn(a, member.email);
      await forgot(a, member.email);
      const token = (await lastEmail(member.email, 'password_reset'))!.token!;
      expect((await reset(token, 'short')).status).toBe(400);
      expect((await reset(token)).status).toBe(204);
      expect(
        (await http().get('/api/v1/auth/me').set('Host', host(a)).set('Cookie', session.cookie))
          .status,
      ).toBe(401);
      expect((await login(a, member.email)).status).toBe(401);
      expect((await login(a, member.email, NEW_PASSWORD)).status).toBe(200);
      expect(await lastEmail(member.email, 'password_changed')).toBeDefined();
      expect((await reset(token, 'Third-Pass#2026x')).status).toBe(404);
    });

    it('only the newest link works', async () => {
      await forgot(a, member.email);
      const older = (await lastEmail(member.email, 'password_reset'))!.token!;
      const redis = new Redis(inject('redisUrl'));
      await redis.del(...(await redis.keys('rl:*')));
      await redis.quit();
      await forgot(a, member.email);
      const newer = (await lastEmail(member.email, 'password_reset'))!.token!;
      expect((await reset(older, 'Fourth-Pass#2026x')).status).toBe(404);
      expect((await reset(newer, 'Fourth-Pass#2026x')).status).toBe(204);
    });
  });
});
