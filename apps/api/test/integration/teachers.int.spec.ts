import {
  OWNER_LEGAL_DOCUMENTS,
  ROLE_TEMPLATES,
  type RoleKey,
  type SearchResults,
  type Teacher,
} from '@academybee/contracts';
import {
  addMemberFixture,
  createTenantFixture,
  FIXTURE_PASSWORD,
  type Grant,
  type MemberFixture,
  type TenantFixture,
} from '@academybee/testing';
import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createTestApp } from '../support/test-app.js';

/**
 * Teachers and the command-palette search (Phase 4 S4; ARCHITECTURE §7.3, C-67, C-105): add a
 * teacher by name, by invitation (linked on accept) or from the team; scopes per role; and a
 * search that never shows more than the caller's lists.
 */
const urls = inject('databaseUrls');

type Session = { host: string; cookie: string; csrf: string };
const templateGrants = (key: RoleKey): Grant[] =>
  Object.entries(ROLE_TEMPLATES[key].grants).map(([capability, scope]) => ({ capability, scope }));

describe('teachers and search', () => {
  let app: INestApplication;
  let su: pg.Client;
  let a: TenantFixture;
  let owner: Session;
  let teacher: MemberFixture;
  let accountant: MemberFixture;
  let receptionist: MemberFixture;
  let teacherProfileId: string;
  const http = () => request(app.getHttpServer());

  async function signIn(t: TenantFixture, email: string): Promise<Session> {
    const host = `${t.slug}.localhost`;
    const res = await http()
      .post('/api/v1/auth/login')
      .set('Host', host)
      .send({ identifier: email, password: FIXTURE_PASSWORD });
    expect(res.status, `sign-in ${email}`).toBe(200);
    const pairs = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .map((c) => c.split(';')[0]!);
    return {
      host,
      cookie: pairs.join('; '),
      csrf: pairs.find((p) => p.startsWith('ab_csrf='))?.slice('ab_csrf='.length) ?? '',
    };
  }
  const get = (s: Session, path: string) =>
    http().get(`/api/v1${path}`).set('Host', s.host).set('Cookie', s.cookie);
  const send = (s: Session, method: 'post' | 'patch', path: string, body: unknown = {}) =>
    http()
      [method](`/api/v1${path}`)
      .set('Host', s.host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(body as object);

  beforeAll(async () => {
    app = await createTestApp();
    su = new pg.Client({ connectionString: urls.superuser });
    await su.connect();
    a = await createTenantFixture(urls.migrator, { name: 'Teachers Academy', plan: 'pro' });
    const member = (roleKey: RoleKey) =>
      addMemberFixture(urls.migrator, a.id, {
        email: `${roleKey}-${a.slug}@example.test`,
        roleKey,
        grants: templateGrants(roleKey),
      });
    [teacher, accountant, receptionist] = await Promise.all([
      member('teacher'),
      member('accountant'),
      member('receptionist'),
    ]);
    // The teacher's own profile teaches the fixture batch (and so the fixture student).
    const { rows } = await su.query<{ id: string }>(
      `INSERT INTO teacher (id, tenant_id, branch_id, membership_id, full_name, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Tara Teacher', now()) RETURNING id`,
      [a.id, a.branchId, teacher.membershipId],
    );
    teacherProfileId = rows[0]!.id;
    await su.query(
      `INSERT INTO batch_teacher (tenant_id, batch_id, teacher_id, is_primary) VALUES ($1, $2, $3, false)`,
      [a.id, a.people.batchId, teacherProfileId],
    );
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
    owner = await signIn(a, a.user.email);
    await send(owner, 'post', '/legal/accept', {
      documentIds: OWNER_LEGAL_DOCUMENTS.map((d) => d.id),
    });
  });

  it('adds a teacher by name, by invitation (linked on accept), and from the team', async () => {
    const byName = await send(owner, 'post', '/teachers', {
      mode: 'name',
      fullName: 'Guest Coach',
      subjects: ['Football'],
    });
    expect(byName.status, JSON.stringify(byName.body)).toBe(201);
    expect(byName.body).toMatchObject({ access: 'NONE', subjects: ['Football'], status: 'ACTIVE' });

    const invited = await send(owner, 'post', '/teachers', {
      mode: 'invite',
      fullName: 'Invited Ira',
      email: `ira-${a.slug}@example.test`,
    });
    expect(invited.status).toBe(201);
    expect(invited.body).toMatchObject({ access: 'INVITED', email: `ira-${a.slug}@example.test` });
    const { rows } = await su.query<{ role_keys: string[] }>(
      'SELECT role_keys FROM invitation WHERE email = $1 AND revoked_at IS NULL',
      [`ira-${a.slug}@example.test`],
    );
    expect(rows[0]!.role_keys).toEqual(['teacher']);

    // Someone already on the team (the accountant) can be linked once.
    const linkable = await get(owner, '/teachers/linkable-members');
    expect(
      (linkable.body.items as { membershipId: string }[]).map((m) => m.membershipId),
    ).toContain(accountant.membershipId);
    const linked = await send(owner, 'post', '/teachers', {
      mode: 'member',
      membershipId: accountant.membershipId,
    });
    expect(linked.status).toBe(201);
    expect(linked.body).toMatchObject({ access: 'MEMBER', email: accountant.email });
    const again = await send(owner, 'post', '/teachers', {
      mode: 'member',
      membershipId: accountant.membershipId,
    });
    expect(again.status).toBe(409);
  });

  it('edits with a version; archiving is audited and leaves the active list', async () => {
    const created = (
      await send(owner, 'post', '/teachers', { mode: 'name', fullName: 'Old Coach' })
    ).body as Teacher;
    const edit = await send(owner, 'patch', `/teachers/${created.id}`, {
      version: created.version,
      subjects: ['Chess'],
    });
    expect(edit.body.subjects).toEqual(['Chess']);
    const stale = await send(owner, 'patch', `/teachers/${created.id}`, {
      version: created.version,
      fullName: 'x',
    });
    expect(stale.status).toBe(409);
    const archived = await send(owner, 'patch', `/teachers/${created.id}`, {
      version: edit.body.version,
      status: 'ARCHIVED',
    });
    expect(archived.body.status).toBe('ARCHIVED');
    const active = await get(owner, '/teachers?limit=100');
    expect((active.body.items as Teacher[]).map((t) => t.id)).not.toContain(created.id);
    const shelf = await get(owner, '/teachers?status=ARCHIVED');
    expect((shelf.body.items as Teacher[]).map((t) => t.id)).toContain(created.id);
    const { rows } = await su.query(
      `SELECT 1 FROM audit_log WHERE action = 'teacher.archived' AND entity_id = $1`,
      [created.id],
    );
    expect(rows).toHaveLength(1);
    const timeline = await get(owner, `/teachers/${created.id}/activity`);
    expect((timeline.body.items as { type: string }[]).map((e) => e.type)).toEqual([
      'teacher.archived',
      'teacher.updated',
      'teacher.created',
    ]);
  });

  it('scopes: a teacher sees only their own profile; the receptionist reads; others are refused', async () => {
    const t = await signIn(a, teacher.email);
    const mine = await get(t, '/teachers?limit=100');
    expect((mine.body.items as Teacher[]).map((x) => x.id)).toEqual([teacherProfileId]);
    expect((await get(t, `/teachers/${a.people.teacherId}`)).status).toBe(404);
    expect((await send(t, 'post', '/teachers', { mode: 'name', fullName: 'x' })).status).toBe(403);
    const r = await signIn(a, receptionist.email);
    expect((await get(r, `/teachers/${a.people.teacherId}`)).status).toBe(200);
    expect(
      (await send(r, 'patch', `/teachers/${a.people.teacherId}`, { version: 1, fullName: 'x' }))
        .status,
    ).toBe(403);
    const acc = await signIn(a, accountant.email);
    expect((await get(acc, '/teachers')).status).toBe(403);
  });

  it('search finds what the caller may see, and nothing more (C-105)', async () => {
    await send(owner, 'post', '/students', { fullName: 'Searchable Unassigned' });
    const o = await get(owner, '/search?q=Student%20One');
    expect(o.status).toBe(200);
    expect((o.body as SearchResults).students.map((s) => s.id)).toEqual([a.people.studentId]);

    // The teacher: only students of their batches; teachers = themself.
    const t = await signIn(a, teacher.email);
    const tSearch = (await get(t, '/search?q=Searchable')).body as SearchResults;
    expect(tSearch.students).toEqual([]);
    expect(
      ((await get(t, '/search?q=Student')).body as SearchResults).students.map((s) => s.id),
    ).toEqual([a.people.studentId]);
    expect(((await get(t, '/search?q=Owner')).body as SearchResults).teachers).toEqual([]);
    expect(((await get(t, '/search?q=Tara')).body as SearchResults).teachers).toEqual([
      { id: teacherProfileId, fullName: 'Tara Teacher' },
    ]);

    // The accountant reads students and parents, not teachers.
    const acc = await signIn(a, accountant.email);
    const accSearch = (await get(acc, '/search?q=Parent%20One')).body as SearchResults;
    expect(accSearch.parents.map((p) => p.id)).toEqual([a.people.parentId]);
    expect(accSearch.parents[0]!.studentId).toBe(a.people.studentId);

    // Another academy's records never appear (same names exist in every fixture).
    const b = await createTenantFixture(urls.migrator, { name: 'Other Search Academy' });
    const other = await signIn(b, b.user.email);
    const bSearch = (await get(other, '/search?q=Student%20One')).body as SearchResults;
    expect(bSearch.students.map((s) => s.id)).toEqual([b.people.studentId]);

    // Too short a query is refused, not a full scan.
    expect((await get(owner, '/search?q=a')).status).toBe(400);
  });
});
