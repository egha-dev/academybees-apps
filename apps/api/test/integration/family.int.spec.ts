import { decryptSecret, hashPassword, loadMasterKeys } from '@academybee/auth';
import { newId, OWNER_LEGAL_DOCUMENTS, ROLE_TEMPLATES, type Student } from '@academybee/contracts';
import {
  addMemberFixture,
  createTenantFixture,
  FIXTURE_PASSWORD,
  type TenantFixture,
} from '@academybee/testing';
import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createTestApp, testConfig } from '../support/test-app.js';

/**
 * The academy side of the Family Hub (G-31, ADR-039) with consent (G-06): parent invites (C-102),
 * linking by a code with uniform answers and the consent guard (C-107), join requests, and the
 * public privacy notice.
 */
const urls = inject('databaseUrls');
type Session = { host: string; cookie: string; csrf: string };
const HUB = 'app.localhost';

describe('family hub, academy side', () => {
  let app: INestApplication;
  let su: pg.Client;
  let a: TenantFixture;
  let b: TenantFixture;
  let owner: Session;
  const http = () => request(app.getHttpServer());
  const keys = loadMasterKeys(testConfig().SECRETS_MASTER_KEY);

  async function login(host: string, email: string): Promise<Session> {
    const res = await http()
      .post('/api/v1/auth/login')
      .set('Host', host)
      .send({ identifier: email, password: FIXTURE_PASSWORD });
    expect(res.status, `sign-in ${email} on ${host}: ${JSON.stringify(res.body)}`).toBe(200);
    const pairs = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .map((c) => c.split(';')[0]!);
    return {
      host,
      cookie: pairs.join('; '),
      csrf: pairs.find((p) => p.startsWith('ab_csrf='))?.slice('ab_csrf='.length) ?? '',
    };
  }
  async function academy(t: TenantFixture, email = t.user.email): Promise<Session> {
    const s = await login(`${t.slug}.localhost`, email);
    await send(s, 'post', '/legal/accept', { documentIds: OWNER_LEGAL_DOCUMENTS.map((d) => d.id) });
    return s;
  }
  const get = (s: Session | { host: string }, path: string) => {
    const r = http().get(`/api/v1${path}`).set('Host', s.host);
    return 'cookie' in s ? r.set('Cookie', s.cookie) : r;
  };
  const send = (s: Session, method: 'post' | 'put', path: string, body: unknown = {}) =>
    http()
      [method](`/api/v1${path}`)
      .set('Host', s.host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(body as object);

  /** A Family Hub user: a verified email and an ACTIVE parent membership in academy B. */
  async function hubUser(email: string): Promise<string> {
    const userId = newId();
    const membershipId = newId();
    await su.query(
      `INSERT INTO "user" (id, email, name, email_verified_at, updated_at) VALUES ($1, $2, 'Hub Parent', now(), now())`,
      [userId, email],
    );
    await su.query(
      `INSERT INTO user_credential (user_id, password_hash, updated_at) VALUES ($1, $2, now())`,
      [userId, await hashPassword(FIXTURE_PASSWORD)],
    );
    await su.query(
      `INSERT INTO membership (id, tenant_id, user_id, status, updated_at) VALUES ($1, $2, $3, 'ACTIVE', now())`,
      [membershipId, b.id, userId],
    );
    await su.query(
      `INSERT INTO membership_role (tenant_id, membership_id, role_id) VALUES ($1, $2, $3)`,
      [b.id, membershipId, b.roleIds.parent],
    );
    return userId;
  }
  /** The newest sealed code emailed to `email`, unsealed with the test keys. */
  async function lastCode(email: string): Promise<string | null> {
    const { rows } = await su.query<{ payload: { to: string; code?: { sealedToken: string } } }>(
      `SELECT payload FROM outbox_event WHERE type = 'email.requested' AND payload->>'template' = 'link_code'
         AND payload->>'to' = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [email],
    );
    const sealed = rows[0]?.payload.code?.sealedToken;
    return sealed ? decryptSecret(sealed, keys) : null;
  }
  async function addStudentWithParent(name: string, parentEmail: string): Promise<Student> {
    const res = await send(owner, 'post', '/students', {
      fullName: name,
      parent: {
        relationship: 'MOTHER',
        parent: { fullName: `Parent of ${name}`, email: parentEmail },
      },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as Student;
  }

  beforeAll(async () => {
    app = await createTestApp();
    su = new pg.Client({ connectionString: urls.superuser });
    await su.connect();
    [a, b] = await Promise.all([
      createTenantFixture(urls.migrator, { name: 'Family Academy A', plan: 'pro' }),
      createTenantFixture(urls.migrator, { name: 'Family Academy B', plan: 'pro' }),
    ]);
  });
  afterAll(async () => {
    await su.end();
    await app.close();
  });
  beforeEach(async () => {
    const redis = new Redis(inject('redisUrl'));
    const keysToClear = await redis.keys('rl:*');
    if (keysToClear.length) await redis.del(...keysToClear);
    await redis.quit();
    owner = await academy(a);
  });

  it('invites a parent to the hub (30 days, no account created); resending replaces the link', async () => {
    const email = `inv-${Date.now()}@example.test`;
    const st = await addStudentWithParent('Invite Kid', email);
    const parentId = st.parents[0]!.parentId;
    const first = await send(owner, 'post', `/parents/${parentId}/invite`);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body).toMatchObject({ access: 'INVITED', email });
    const days = (new Date(first.body.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    const { rows } = await su.query(
      `SELECT role_keys, parent_id FROM invitation WHERE parent_id = $1 AND revoked_at IS NULL`,
      [parentId],
    );
    expect(rows).toEqual([{ role_keys: ['parent'], parent_id: parentId }]);
    const users = await su.query('SELECT 1 FROM "user" WHERE email = $1', [email]);
    expect(users.rows).toHaveLength(0);
    const mail = await su.query(
      `SELECT payload FROM outbox_event WHERE payload->>'template' = 'parent_invite' AND payload->>'to' = $1`,
      [email],
    );
    expect(mail.rows[0].payload).toMatchObject({
      host: { kind: 'hub' },
      link: { path: '/invite#token={token}' },
    });
    expect(JSON.stringify(mail.rows[0].payload)).not.toMatch(/token=[A-Za-z0-9_-]{20}/);

    const after = await get(owner, `/students/${st.id}`);
    expect(after.body.parents[0]).toMatchObject({ access: 'INVITED' });
    await send(owner, 'post', `/parents/${parentId}/invite`);
    const open = await su.query(
      `SELECT 1 FROM invitation WHERE parent_id = $1 AND revoked_at IS NULL`,
      [parentId],
    );
    expect(open.rows).toHaveLength(1);
    // A parent without an email can't be invited.
    expect((await send(owner, 'post', `/parents/${a.people.parentId}/invite`)).status).toBe(400);
  });

  it('linking from the hub: the same answer whatever the academy knows; the code plus consent links', async () => {
    const email = `hub-${Date.now()}@example.test`;
    await hubUser(email);
    const hub = await login(HUB, email);
    const start = (slug: string) =>
      send(hub, 'post', `/hub/academies/${slug}/link/start`, { method: 'QR' });

    // Unknown academy, academy without this parent: identical answers, no email.
    const unknown = await start('no-such-academy');
    const unmatched = await start(a.slug);
    expect(unknown.status).toBe(202);
    expect(unmatched.status).toBe(202);
    expect(unknown.body).toEqual(unmatched.body);
    expect(await lastCode(email)).toBeNull();

    // The academy has the parent's email: a code is sent (sealed), same answer.
    const st = await addStudentWithParent('Linked Kid', email);
    const matched = await start(a.slug);
    expect(matched.body).toEqual(unmatched.body);
    const code = await lastCode(email);
    expect(code).toMatch(/^\d{6}$/);

    const wrong = await send(hub, 'post', `/hub/academies/${a.slug}/link/verify`, {
      code: code === '000000' ? '111111' : '000000',
      purposes: ['service'],
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.details).toEqual([{ path: 'code', issue: 'invalid_code' }]);
    const noService = await send(hub, 'post', `/hub/academies/${a.slug}/link/verify`, {
      code,
      purposes: ['photos'],
    });
    expect(noService.status).toBe(400);

    const ok = await send(hub, 'post', `/hub/academies/${a.slug}/link/verify`, {
      code,
      purposes: ['service', 'photos'],
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body).toEqual({ linked: true, children: 1 });
    const consent = await su.query(
      `SELECT channel, purposes FROM consent_record WHERE student_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
      [st.id],
    );
    expect(consent.rows[0]).toEqual({ channel: 'FAMILY_HUB', purposes: ['service', 'photos'] });
    const member = await su.query(
      `SELECT m.status FROM membership m JOIN "user" u ON u.id = m.user_id WHERE u.email = $1 AND m.tenant_id = $2`,
      [email, a.id],
    );
    expect(member.rows).toEqual([{ status: 'ACTIVE' }]);
    expect((await get(owner, `/students/${st.id}`)).body.parents[0].access).toBe('MEMBER');
    // A used code doesn't work again.
    const again = await send(hub, 'post', `/hub/academies/${a.slug}/link/verify`, {
      code,
      purposes: ['service'],
    });
    expect(again.status).toBe(400);
  });

  it('a code allows 5 tries; link attempts are the parent’s own rows, invisible to the academy', async () => {
    const email = `tries-${Date.now()}@example.test`;
    await hubUser(email);
    const hub = await login(HUB, email);
    await addStudentWithParent('Tries Kid', email);
    await send(hub, 'post', `/hub/academies/${a.slug}/link/start`, { method: 'URL' });
    const code = (await lastCode(email))!;
    const wrong = code === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i += 1)
      await send(hub, 'post', `/hub/academies/${a.slug}/link/verify`, {
        code: wrong,
        purposes: ['service'],
      });
    const late = await send(hub, 'post', `/hub/academies/${a.slug}/link/verify`, {
      code,
      purposes: ['service'],
    });
    expect(late.status).toBe(400);

    // As the academy (tenant context, app role): nothing to read.
    const appDb = new pg.Client({ connectionString: urls.app });
    await appDb.connect();
    try {
      await appDb.query('BEGIN');
      await appDb.query(`SELECT set_config('app.tenant_id', $1, true)`, [a.id]);
      const { rows } = await appDb.query('SELECT count(*)::int AS n FROM academy_link_attempt');
      expect(rows[0].n).toBe(0);
      await appDb.query('ROLLBACK');
    } finally {
      await appDb.end();
    }
  });

  it('join requests: received, approved by linking a student (membership waits for consent), rejected', async () => {
    const email = `join-${Date.now()}@example.test`;
    await hubUser(email);
    const hub = await login(HUB, email);
    const asked = await send(hub, 'post', `/hub/academies/${a.slug}/join-requests`, {
      parentName: 'Joining Parent',
      phone: '9840077777',
      childName: 'Student One',
    });
    expect(asked.status).toBe(202);
    expect(
      (
        await send(hub, 'post', '/hub/academies/no-such-academy/join-requests', {
          parentName: 'X',
          childName: 'Y',
        })
      ).body,
    ).toEqual(asked.body);

    const list = await get(owner, '/join-requests');
    const request = (
      list.body.items as Array<{ id: string; parentName: string; status: string }>
    ).find((r) => r.parentName === 'Joining Parent')!;
    expect(request).toMatchObject({ status: 'PENDING' });
    const approved = await send(owner, 'post', `/join-requests/${request.id}/approve`, {
      studentIds: [a.people.studentId],
      relationship: 'FATHER',
    });
    expect(approved.status, JSON.stringify(approved.body)).toBe(204);
    const member = await su.query(
      `SELECT m.status FROM membership m JOIN "user" u ON u.id = m.user_id WHERE u.email = $1 AND m.tenant_id = $2`,
      [email, a.id],
    );
    // Not ACTIVE: the parent still has to consent in the hub (C-102, C-103).
    expect(member.rows).toEqual([{ status: 'INVITED' }]);
    const link = await su.query(
      `SELECT ps.relationship FROM parent_student ps JOIN parent p ON p.id = ps.parent_id
        WHERE p.email = $1 AND ps.student_id = $2`,
      [email, a.people.studentId],
    );
    expect(link.rows).toEqual([{ relationship: 'FATHER' }]);
    expect(
      (
        await send(owner, 'post', `/join-requests/${request.id}/approve`, {
          studentIds: [a.people.studentId],
        })
      ).status,
    ).toBe(409);

    // Another academy never sees or decides A's requests.
    const other = await academy(b);
    const bList = await get(other, '/join-requests');
    expect((bList.body.items as Array<{ id: string }>).map((r) => r.id)).not.toContain(request.id);
    expect((await send(other, 'post', `/join-requests/${request.id}/reject`, {})).status).toBe(404);
    // Roles: the accountant doesn't manage parents.
    const acc = await addMemberFixture(urls.migrator, a.id, {
      email: `acc-join-${a.slug}@example.test`,
      roleKey: 'accountant',
      grants: Object.entries(ROLE_TEMPLATES.accountant.grants).map(([capability, scope]) => ({
        capability,
        scope,
      })),
    });
    expect((await get(await academy(a, acc.email), '/join-requests')).status).toBe(403);
  });

  it('paper consent never activates a parent; the hub consent does (C-103)', async () => {
    const email = `guard-${Date.now()}@example.test`;
    await hubUser(email);
    const hub = await login(HUB, email);
    const st = await addStudentWithParent('Guard Kid', email);
    await send(owner, 'post', `/students/${st.id}/consents`, {
      parentId: st.parents[0]!.parentId,
      action: 'GRANT',
      purposes: ['service'],
      channel: 'PAPER',
    });
    await send(hub, 'post', `/hub/academies/${a.slug}/link/start`, { method: 'QR' });
    const code = (await lastCode(email))!;
    // Verify records the hub consent, then activates: ACTIVE.
    const ok = await send(hub, 'post', `/hub/academies/${a.slug}/link/verify`, {
      code,
      purposes: ['service'],
    });
    expect(ok.status).toBe(200);
    const channels = await su.query<{ channel: string }>(
      `SELECT channel FROM consent_record WHERE student_id = $1 ORDER BY recorded_at`,
      [st.id],
    );
    expect(channels.rows.map((r) => r.channel)).toEqual(['PAPER', 'FAMILY_HUB']);
  });

  it('publishes the academy privacy notice without signing in', async () => {
    await su.query(`UPDATE tenant_settings SET contact = $2 WHERE tenant_id = $1`, [
      a.id,
      JSON.stringify({ email: 'office@family-a.test', phone: '+919800000009' }),
    ]);
    const res = await get({ host: `${a.slug}.localhost` }, '/academy/privacy-notice');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      academy: 'Family Academy A',
      email: 'office@family-a.test',
      version: expect.any(String),
    });
  });
});
