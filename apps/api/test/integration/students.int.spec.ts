import {
  OWNER_LEGAL_DOCUMENTS,
  ROLE_TEMPLATES,
  type RoleKey,
  type Student,
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
 * Students, parents, health notes, consent, custom fields and the timeline (Phase 4 S2; G-05,
 * G-06, G-26, G-27, C-103…C-108): scope per role (ARCHITECTURE §7.3), out of scope = 404,
 * restricted health notes with audited reads, and optimistic concurrency.
 */
const urls = inject('databaseUrls');

type Session = { host: string; cookie: string; csrf: string };

const templateGrants = (key: RoleKey): Grant[] =>
  Object.entries(ROLE_TEMPLATES[key].grants).map(([capability, scope]) => ({ capability, scope }));

describe('students and parents', () => {
  let app: INestApplication;
  let su: pg.Client;
  let a: TenantFixture;
  let owner: Session;
  let receptionist: MemberFixture;
  let accountant: MemberFixture;
  let teacher: MemberFixture;
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
  const send = (
    s: Session,
    method: 'post' | 'patch' | 'put' | 'delete',
    path: string,
    body: unknown = {},
  ) =>
    http()
      [method](`/api/v1${path}`)
      .set('Host', s.host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(body as object);
  async function createStudent(s: Session, body: Record<string, unknown>): Promise<Student> {
    const res = await send(s, 'post', '/students', body);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as Student;
  }
  async function auditCount(action: string, entityId: string): Promise<number> {
    const { rows } = await su.query<{ n: string }>(
      'SELECT count(*) AS n FROM audit_log WHERE action = $1 AND entity_id = $2',
      [action, entityId],
    );
    return Number(rows[0]!.n);
  }

  beforeAll(async () => {
    app = await createTestApp();
    su = new pg.Client({ connectionString: urls.superuser });
    await su.connect();
    a = await createTenantFixture(urls.migrator, { name: 'People Academy', plan: 'pro' });
    const member = (roleKey: RoleKey) =>
      addMemberFixture(urls.migrator, a.id, {
        email: `${roleKey}-${a.slug}@example.test`,
        roleKey,
        grants: templateGrants(roleKey),
      });
    [receptionist, accountant, teacher] = await Promise.all([
      member('receptionist'),
      member('accountant'),
      member('teacher'),
    ]);
    // The teacher teaches the fixture batch (ASSIGNED): their own Teacher profile.
    await su.query(
      `INSERT INTO teacher (id, tenant_id, branch_id, membership_id, full_name, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Teacher Two', now())`,
      [a.id, a.branchId, teacher.membershipId],
    );
    await su.query(
      `INSERT INTO batch_teacher (tenant_id, batch_id, teacher_id, is_primary)
       SELECT $1, $2, id, false FROM teacher WHERE membership_id = $3`,
      [a.id, a.people.batchId, teacher.membershipId],
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

  it('adds a student with a new parent (primary), then a second child to the same parent', async () => {
    const first = await createStudent(owner, {
      fullName: 'ആദിത്യ Menon',
      dateOfBirth: '2016-04-02',
      parent: {
        relationship: 'MOTHER',
        parent: { fullName: 'Lakshmi Menon', phone: '98400 11111' },
      },
    });
    expect(first.admissionNo).toMatch(/^ADM-\d{4}$/);
    expect(first.parents).toEqual([
      expect.objectContaining({
        fullName: 'Lakshmi Menon',
        phone: '+919840011111',
        relationship: 'MOTHER',
        isPrimaryContact: true,
      }),
    ]);
    expect(first).not.toHaveProperty('healthNote');
    const parentId = first.parents[0]!.parentId;

    // "Use existing" suggestion, then link the same parent to a second child.
    const dup = await get(owner, '/parents/duplicates?phone=9840011111');
    expect(dup.body.items).toEqual([expect.objectContaining({ id: parentId, childrenCount: 1 })]);
    const second = await createStudent(owner, {
      fullName: 'Diya Menon',
      parent: { parentId, relationship: 'MOTHER' },
    });
    expect(second.parents[0]).toMatchObject({ parentId, isPrimaryContact: true });
    const parent = await get(owner, `/parents/${parentId}`);
    expect(parent.status).toBe(200);
    expect((parent.body.children as { fullName: string }[]).map((c) => c.fullName).sort()).toEqual([
      'Diya Menon',
      'ആദിത്യ Menon',
    ]);

    // A second parent for the first child; making them primary moves the flag.
    const linked = await send(owner, 'post', `/students/${first.id}/parents`, {
      relationship: 'FATHER',
      isPrimaryContact: true,
      parent: { fullName: 'Ravi Menon', email: 'Ravi@Example.test' },
    });
    expect(linked.status).toBe(201);
    const parents = (linked.body as Student).parents;
    expect(parents.map((p) => [p.fullName, p.isPrimaryContact])).toEqual([
      ['Ravi Menon', true],
      ['Lakshmi Menon', false],
    ]);
    expect(parents[0]!.email).toBe('ravi@example.test');
    // Linking the same parent twice is refused.
    const again = await send(owner, 'post', `/students/${first.id}/parents`, { parentId });
    expect(again.status).toBe(409);
  });

  it('finds students by part of a name, admission number or a parent phone', async () => {
    const s = await createStudent(owner, {
      fullName: 'Kabir Searchable',
      parent: { parent: { fullName: 'P', phone: '+919811122233' } },
    });
    const ids = async (q: string) =>
      ((await get(owner, `/students?q=${encodeURIComponent(q)}`)).body.items as Student[]).map(
        (x) => x.id,
      );
    expect(await ids('archab')).toEqual([s.id]);
    expect(await ids(s.admissionNo)).toEqual([s.id]);
    expect(await ids('1112223')).toEqual([s.id]);
    expect(await ids('nobody-like-this')).toEqual([]);
  });

  it('pages with a keyset cursor in name order', async () => {
    const page1 = await get(owner, '/students?limit=2');
    expect(page1.status).toBe(200);
    expect(page1.body.items).toHaveLength(2);
    const page2 = await get(owner, `/students?limit=2&cursor=${page1.body.nextCursor}`);
    const names = ([...page1.body.items, ...page2.body.items] as Student[]).map((x) => x.fullName);
    expect(names).toEqual([...names].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
    expect(new Set(names).size).toBe(names.length);
  });

  it('receptionist: create and edit, no archive, no health notes (G-05)', async () => {
    const s = await signIn(a, receptionist.email);
    const created = await createStudent(s, { fullName: 'Front Desk Kid' });
    const edit = await send(s, 'patch', `/students/${created.id}`, {
      version: created.version,
      grade: 'Grade 3',
    });
    expect(edit.status).toBe(200);
    expect(edit.body.grade).toBe('Grade 3');
    expect((await send(s, 'post', `/students/${created.id}/archive`, { version: 2 })).status).toBe(
      403,
    );
    expect((await get(s, `/students/${a.people.studentId}/health-note`)).status).toBe(403);
    // They don't even learn that a note exists.
    expect((await get(s, `/students/${a.people.studentId}`)).body.hasHealthNote).toBe(false);
    expect((await get(owner, `/students/${a.people.studentId}`)).body.hasHealthNote).toBe(true);
  });

  it('accountant: reads, never writes', async () => {
    const s = await signIn(a, accountant.email);
    expect((await get(s, `/students/${a.people.studentId}`)).status).toBe(200);
    expect((await send(s, 'post', '/students', { fullName: 'Nope' })).status).toBe(403);
    expect(
      (await send(s, 'patch', `/students/${a.people.studentId}`, { version: 1, grade: 'x' }))
        .status,
    ).toBe(403);
    expect((await get(s, `/students/${a.people.studentId}/health-note`)).status).toBe(403);
  });

  it('teacher: only students of batches they teach (ASSIGNED); their health notes, audited', async () => {
    const other = await createStudent(owner, { fullName: 'Not In Their Batch' });
    const s = await signIn(a, teacher.email);
    const list = await get(s, '/students?limit=100');
    expect(list.status).toBe(200);
    expect((list.body.items as Student[]).map((x) => x.id)).toEqual([a.people.studentId]);
    expect((await get(s, `/students/${other.id}`)).status).toBe(404);
    expect((await get(s, `/students/${other.id}/health-note`)).status).toBe(404);
    const before = await auditCount('student.health_note_read', a.people.studentId);
    const note = await get(s, `/students/${a.people.studentId}/health-note`);
    expect(note.status).toBe(200);
    expect(note.body.note.notes).toBe('Fixture note');
    expect(await auditCount('student.health_note_read', a.people.studentId)).toBe(before + 1);
    // Teachers read; they don't edit notes or students.
    expect(
      (await send(s, 'put', `/students/${a.people.studentId}/health-note`, { notes: 'x' })).status,
    ).toBe(403);
  });

  it('health notes: write with version, clear, every read audited; never in the timeline text', async () => {
    const st = await createStudent(owner, { fullName: 'Health Note Kid' });
    const created = await send(owner, 'put', `/students/${st.id}/health-note`, {
      notes: 'Peanut allergy',
    });
    expect(created.status).toBe(200);
    expect(created.body.note).toMatchObject({ notes: 'Peanut allergy', version: 1 });
    const stale = await send(owner, 'put', `/students/${st.id}/health-note`, {
      notes: 'x',
      version: 7,
    });
    expect(stale.status).toBe(409);
    const cleared = await send(owner, 'put', `/students/${st.id}/health-note`, {
      notes: '',
      version: 1,
    });
    expect(cleared.body.note).toBeNull();
    expect(await auditCount('student.health_note_read', st.id)).toBeGreaterThanOrEqual(2);
    const activity = await get(owner, `/students/${st.id}/activity`);
    expect(JSON.stringify(activity.body)).not.toContain('Peanut');
  });

  it('consent: staff record and withdraw (paper); history newest first; must be their parent', async () => {
    const st = await createStudent(owner, {
      fullName: 'Consent Kid',
      parent: { parent: { fullName: 'Consenting Parent' } },
    });
    const parentId = st.parents[0]!.parentId;
    const granted = await send(owner, 'post', `/students/${st.id}/consents`, {
      parentId,
      action: 'GRANT',
      purposes: ['service', 'photos'],
      channel: 'PAPER',
    });
    expect(granted.status).toBe(201);
    const withdrawn = await send(owner, 'post', `/students/${st.id}/consents`, {
      parentId,
      action: 'WITHDRAW',
      channel: 'ACADEMY_STAFF',
    });
    expect((withdrawn.body.items as { action: string }[]).map((c) => c.action)).toEqual([
      'WITHDRAW',
      'GRANT',
    ]);
    expect(withdrawn.body.items[0]).toMatchObject({
      purposes: ['service', 'photos'],
      noticeVersion: expect.any(String),
    });
    const notService = await send(owner, 'post', `/students/${st.id}/consents`, {
      parentId,
      action: 'GRANT',
      purposes: ['photos'],
      channel: 'PAPER',
    });
    expect(notService.status).toBe(400);
    const strangers = await send(owner, 'post', `/students/${st.id}/consents`, {
      parentId: a.people.parentId,
      action: 'GRANT',
      purposes: ['service'],
      channel: 'PAPER',
    });
    expect(strangers.status).toBe(400);
    // Staff consent never creates or activates a parent account (C-103).
    const { rows } = await su.query('SELECT user_id FROM parent WHERE id = $1', [parentId]);
    expect(rows[0].user_id).toBeNull();
  });

  it('status changes need a reason, are audited, and use the version (G-27)', async () => {
    const st = await createStudent(owner, { fullName: 'Status Kid' });
    const held = await send(owner, 'post', `/students/${st.id}/status`, {
      version: st.version,
      status: 'ON_HOLD',
      reason: 'Exams',
    });
    expect(held.status).toBe(200);
    expect(held.body.status).toBe('ON_HOLD');
    const same = await send(owner, 'post', `/students/${st.id}/status`, {
      version: held.body.version,
      status: 'ON_HOLD',
      reason: 'again',
    });
    expect(same.status).toBe(409);
    const stale = await send(owner, 'post', `/students/${st.id}/status`, {
      version: st.version,
      status: 'ACTIVE',
      reason: 'Undo',
    });
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    expect(await auditCount('student.status_changed', st.id)).toBe(1);
    const timeline = await get(owner, `/students/${st.id}/activity`);
    expect((timeline.body.items as { type: string }[]).map((e) => e.type)).toEqual([
      'student.status_changed',
      'student.created',
    ]);
    expect(timeline.body.items[0].data).toEqual({ from: 'ACTIVE', to: 'ON_HOLD' });
  });

  it('archive hides from lists, is read-only, restores within 90 days (G-26)', async () => {
    const st = await createStudent(owner, { fullName: 'Archive Kid Zz' });
    const archived = await send(owner, 'post', `/students/${st.id}/archive`, {
      version: st.version,
      reason: 'Moved away',
    });
    expect(archived.status).toBe(200);
    expect(archived.body.restorableUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const current = await get(owner, '/students?q=Archive%20Kid');
    expect(current.body.items).toEqual([]);
    const shelf = await get(owner, '/students?q=Archive%20Kid&archived=true');
    expect((shelf.body.items as Student[]).map((x) => x.id)).toEqual([st.id]);
    const edit = await send(owner, 'patch', `/students/${st.id}`, {
      version: archived.body.version,
      grade: 'x',
    });
    expect(edit.status).toBe(409);
    const restored = await send(owner, 'post', `/students/${st.id}/restore`, {
      version: archived.body.version,
    });
    expect(restored.status).toBe(200);
    expect(restored.body.archivedAt).toBeNull();

    // Past the window: stays archived.
    const old = await createStudent(owner, { fullName: 'Old Archive' });
    const oldArchived = await send(owner, 'post', `/students/${old.id}/archive`, {
      version: old.version,
    });
    await su.query(`UPDATE student SET archived_at = now() - interval '91 days' WHERE id = $1`, [
      old.id,
    ]);
    const late = await send(owner, 'post', `/students/${old.id}/restore`, {
      version: oldArchived.body.version,
    });
    expect(late.status).toBe(409);
    expect(late.body.error.details).toEqual([
      { path: 'archivedAt', issue: 'restore_window_passed' },
    ]);
  });

  it('unlinks a parent (history kept) and moves the primary contact', async () => {
    const st = await createStudent(owner, {
      fullName: 'Unlink Kid',
      parent: { parent: { fullName: 'First P' } },
    });
    const both = await send(owner, 'post', `/students/${st.id}/parents`, {
      parent: { fullName: 'Second P' },
    });
    const [primary] = (both.body as Student).parents;
    const after = await send(owner, 'delete', `/students/${st.id}/parents/${primary!.linkId}`);
    expect(after.status).toBe(200);
    expect((after.body as Student).parents).toEqual([
      expect.objectContaining({ fullName: 'Second P', isPrimaryContact: true }),
    ]);
    const { rows } = await su.query('SELECT status FROM parent WHERE id = $1', [primary!.parentId]);
    expect(rows[0].status).toBe('ACTIVE');
  });

  it('custom fields: owner defines them; values are typed; required on create; max 10', async () => {
    const field = await send(owner, 'post', '/custom-fields', {
      label: 'Belt colour',
      type: 'SELECT',
      options: ['White', 'Yellow'],
    });
    expect(field.status).toBe(201);
    expect(field.body).toMatchObject({ key: 'belt_colour', type: 'SELECT' });
    const white = field.body.options[0].value as string;
    const bad = await send(owner, 'post', '/students', {
      fullName: 'Field Kid',
      customFields: { belt_colour: 'Black' },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details).toEqual([
      { path: 'customFields.belt_colour', issue: 'invalid' },
    ]);
    const ok = await createStudent(owner, {
      fullName: 'Field Kid',
      customFields: { belt_colour: white },
    });
    expect(ok.customFields).toMatchObject({ belt_colour: white });
    const rec = await signIn(a, receptionist.email);
    expect((await send(rec, 'post', '/custom-fields', { label: 'x', type: 'TEXT' })).status).toBe(
      403,
    );
    expect((await get(rec, '/custom-fields')).status).toBe(200);
    for (let i = 0; i < 8; i += 1)
      await send(owner, 'post', '/custom-fields', { label: `Field ${i}`, type: 'TEXT' });
    const eleventh = await send(owner, 'post', '/custom-fields', {
      label: 'One too many',
      type: 'TEXT',
    });
    expect(eleventh.status).toBe(400);
  });

  it("another academy can't see or change this academy's students, parents or fields", async () => {
    const b = await createTenantFixture(urls.migrator, { name: 'Other Academy' });
    const other = await signIn(b, b.user.email);
    await send(other, 'post', '/legal/accept', {
      documentIds: OWNER_LEGAL_DOCUMENTS.map((d) => d.id),
    });
    const st = await createStudent(owner, { fullName: 'Private To A' });
    const attempts = [
      get(other, `/students/${st.id}`),
      get(other, `/students/${st.id}/activity`),
      get(other, `/students/${st.id}/health-note`),
      send(other, 'patch', `/students/${st.id}`, { version: st.version, grade: 'x' }),
      send(other, 'post', `/students/${st.id}/status`, {
        version: st.version,
        status: 'LEFT',
        reason: 'x',
      }),
      send(other, 'post', `/students/${st.id}/archive`, { version: st.version }),
      send(other, 'post', `/students/${st.id}/restore`, { version: st.version }),
      send(other, 'post', `/students/${st.id}/parents`, { parent: { fullName: 'x' } }),
      send(other, 'delete', `/students/${a.people.studentId}/parents/${a.people.parentLinkId}`),
      send(other, 'put', `/students/${a.people.studentId}/health-note`, { notes: 'x' }),
      send(other, 'post', `/students/${a.people.studentId}/consents`, {
        parentId: a.people.parentId,
        action: 'GRANT',
        purposes: ['service'],
        channel: 'PAPER',
      }),
      get(other, `/parents/${a.people.parentId}`),
      send(other, 'patch', `/parents/${a.people.parentId}`, { version: 1, fullName: 'x' }),
      send(other, 'patch', `/custom-fields/${a.people.customFieldId}`, { required: true }),
    ];
    for (const [i, res] of (await Promise.all(attempts)).entries())
      expect(res.status, `attempt ${i}`).toBe(404);
    // B's lists and suggestions never show A's students, parents or fields; a tenantId in a body
    // changes nothing.
    // (Both fixtures have a parent with this phone: B only ever sees its own.)
    const suggestions = (await get(other, '/parents/duplicates?phone=%2B919800000001')).body
      .items as { id: string }[];
    expect(suggestions.map((p) => p.id)).toEqual([b.people.parentId]);
    expect((await get(other, '/students?q=Private')).body.items).toEqual([]);
    expect(
      ((await get(other, '/custom-fields')).body.items as { id: string }[]).map((f) => f.id),
    ).not.toContain(a.people.customFieldId);
    const spoofed = await send(other, 'post', '/students', { fullName: 'Spoof', tenantId: a.id });
    expect(spoofed.status === 201 || spoofed.status === 400).toBe(true);
    const { rows } = await su.query(`SELECT tenant_id FROM student WHERE full_name = 'Spoof'`);
    for (const r of rows) expect(r.tenant_id).toBe(b.id);
    const after = await get(owner, `/students/${st.id}`);
    expect(after.body).toMatchObject({ version: st.version, status: 'ACTIVE', archivedAt: null });
  });

  it("the plan's student limit applies to Add Student and to restoring (ADR-028)", async () => {
    const t = await createTenantFixture(urls.migrator, { name: 'Small Plan Academy' });
    const s = await signIn(t, t.user.email);
    await send(s, 'post', '/legal/accept', { documentIds: OWNER_LEGAL_DOCUMENTS.map((d) => d.id) });
    await su.query(
      `INSERT INTO subscription_override (id, tenant_id, key, kind, "limit", reason)
       VALUES (gen_random_uuid(), $1, 'students', 'LIMIT', 2, 'test')`,
      [t.id],
    );
    const second = await createStudent(s, { fullName: 'Second Seat' });
    const third = await send(s, 'post', '/students', { fullName: 'Third Seat' });
    expect(third.status).toBe(403);
    expect(third.body.error.code).toBe('ENTITLEMENT_LIMIT_REACHED');
    // Leaving frees a seat; coming back needs one.
    const left = await send(s, 'post', `/students/${second.id}/status`, {
      version: second.version,
      status: 'LEFT',
      reason: 'Moved',
    });
    await createStudent(s, { fullName: 'Third Seat' });
    const back = await send(s, 'post', `/students/${second.id}/status`, {
      version: left.body.version,
      status: 'ACTIVE',
      reason: 'Returned',
    });
    expect(back.status).toBe(403);
  });
});
