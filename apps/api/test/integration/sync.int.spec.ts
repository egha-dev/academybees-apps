import {
  addDays,
  localDate,
  newId,
  ROLE_TEMPLATES,
  type RoleKey,
  type SyncOp,
  type SyncOpResult,
  type SyncSnapshot,
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

import { MembershipService } from '../../src/core/auth/membership.service.js';
import { createTestApp } from '../support/test-app.js';

/**
 * Offline sync (Phase 6 S2; ADR-016, ARCHITECTURE §11.3): exactly-once push through the op
 * ledger, rejections and conflicts that stay visible, per-entity ordering, and the working set
 * a device keeps (bootstrap, pull, removal by absence, revocation).
 */
const urls = inject('databaseUrls');

type Session = { host: string; cookie: string; csrf: string };
const templateGrants = (key: RoleKey): Grant[] =>
  Object.entries(ROLE_TEMPLATES[key].grants).map(([capability, scope]) => ({ capability, scope }));
const today = () => localDate(new Date(), 'Asia/Kolkata');

describe('sync', () => {
  let app: INestApplication;
  let su: pg.Client;
  let a: TenantFixture;
  let b: TenantFixture;
  let owner: Session;
  let teacher: Session;
  let teacherMember: MemberFixture;
  let teacherProfile: string;
  let taught: string;
  let other: string;
  let students: string[];
  const teacherEmail = () => `teacher-${a.slug}@example.test`;
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
  const post = (s: Session, path: string, body: unknown) =>
    http()
      .post(`/api/v1${path}`)
      .set('Host', s.host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .send(body as object);
  const push = async (s: Session, ops: SyncOp[]) => {
    const res = await post(s, '/sync/push', { ops });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.results as SyncOpResult[];
  };
  const markOp = (sessionId: string, marks: object[], opId = newId()): SyncOp => ({
    opId,
    type: 'attendance.markSession',
    entityKey: `session:${sessionId}`,
    payload: { sessionId, marks },
    clientCreatedAt: new Date().toISOString(),
    deviceId: 'device-1',
    schemaVersion: 2,
  });
  const allPresent = (ids = students) => ids.map((studentId) => ({ studentId, status: 'PRESENT' }));

  async function classOn(batchId: string, date = today(), start = '10:00', end = '11:00') {
    const id = newId();
    await su.query(
      `INSERT INTO class_session (id, tenant_id, branch_id, batch_id, session_date, starts_at, ends_at,
         origin, updated_at)
       VALUES ($1, $2, $3, $4, $5::date, ($5::date + $6::time) AT TIME ZONE 'Asia/Kolkata',
               ($5::date + $7::time) AT TIME ZONE 'Asia/Kolkata', 'MANUAL', now())`,
      [id, a.id, a.branchId, batchId, date, start, end],
    );
    return id;
  }
  async function batch(name: string): Promise<string> {
    const res = await post(owner, '/batches', { name, courseId: a.people.courseId }).set(
      'Idempotency-Key',
      crypto.randomUUID(),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.id as string;
  }
  const attendanceRows = async (sessionId: string) =>
    (
      await su.query<{ student_id: string; status: string; version: number }>(
        `SELECT student_id, status, version FROM attendance WHERE session_id = $1 ORDER BY student_id`,
        [sessionId],
      )
    ).rows;

  beforeAll(async () => {
    app = await createTestApp();
    su = new pg.Client({ connectionString: urls.superuser });
    await su.connect();
    [a, b] = await Promise.all([
      createTenantFixture(urls.migrator, { name: 'Sync Academy', plan: 'pro' }),
      createTenantFixture(urls.migrator, { name: 'Other Sync Academy', plan: 'pro' }),
    ]);
    teacherMember = await addMemberFixture(urls.migrator, a.id, {
      email: teacherEmail(),
      roleKey: 'teacher',
      grants: templateGrants('teacher'),
    });
    await addMemberFixture(urls.migrator, a.id, {
      email: `accountant-${a.slug}@example.test`,
      roleKey: 'accountant',
      grants: templateGrants('accountant'),
    });
    owner = await signIn(a, a.user.email);
    taught = await batch('Synced batch');
    other = await batch('Someone else’s batch');
    const { rows } = await su.query<{ id: string }>(
      `INSERT INTO teacher (id, tenant_id, branch_id, membership_id, full_name, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Sync Teacher', now()) RETURNING id`,
      [a.id, a.branchId, teacherMember.membershipId],
    );
    teacherProfile = rows[0]!.id;
    await su.query(
      `INSERT INTO batch_teacher (tenant_id, batch_id, teacher_id, is_primary) VALUES ($1, $2, $3, true)`,
      [a.id, taught, teacherProfile],
    );
    students = [];
    for (const name of ['Dev Menon', 'Esha Pillai', 'Farah Khan']) {
      const res = await post(owner, '/students', { fullName: name, phone: '+919840012345' }).set(
        'Idempotency-Key',
        crypto.randomUUID(),
      );
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      students.push(res.body.id as string);
    }
    for (const batchId of [taught, other])
      for (const studentId of students)
        await su.query(
          `INSERT INTO batch_enrolment (id, tenant_id, batch_id, student_id, started_on, updated_at)
           VALUES ($1, $2, $3, $4, CURRENT_DATE - 60, now())`,
          [newId(), a.id, batchId, studentId],
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
    teacher = await signIn(a, teacherEmail());
  });

  it('push applies once: a resent op is DUPLICATE with the same result, and the ledger keeps it', async () => {
    const sessionId = await classOn(taught);
    const op = markOp(sessionId, allPresent());
    const [first] = await push(teacher, [op]);
    expect(first).toMatchObject({ opId: op.opId, status: 'APPLIED' });
    const marks = (first!.data as { marks: { version: number }[] }).marks;
    expect(marks).toHaveLength(3);
    expect(marks.every((m) => m.version === 1)).toBe(true);
    const [again] = await push(teacher, [op]);
    expect(again).toEqual({ ...first, status: 'DUPLICATE' });
    expect(await attendanceRows(sessionId)).toHaveLength(3);
    const { rows } = await su.query(
      `SELECT status, type, entity_key FROM sync_operation WHERE op_id = $1`,
      [op.opId],
    );
    expect(rows).toEqual([
      { status: 'APPLIED', type: 'attendance.markSession', entity_key: `session:${sessionId}` },
    ]);
  });

  it('50 concurrent pushes of the same op: one applies, the rest are DUPLICATE, one set of rows', async () => {
    const sessionId = await classOn(taught, today(), '12:00', '13:00');
    const op = markOp(sessionId, [
      { studentId: students[0], status: 'ABSENT' },
      { studentId: students[1], status: 'PRESENT' },
    ]);
    const all = await Promise.all(Array.from({ length: 50 }, () => push(teacher, [op])));
    const statuses = all.map((r) => r[0]?.status);
    expect(statuses.filter((s) => s === 'APPLIED')).toHaveLength(1);
    expect(statuses.filter((s) => s === 'DUPLICATE')).toHaveLength(49);
    expect(await attendanceRows(sessionId)).toHaveLength(2);
    const { rows } = await su.query(
      `SELECT count(*)::int AS n FROM notification_intent WHERE session_id = $1`,
      [sessionId],
    );
    expect(rows[0].n).toBe(1);
  });

  it('rejections stay visible and repeat: not my class, cancelled, invalid, unsupported', async () => {
    const notMine = await classOn(other, today(), '14:00', '15:00');
    const cancelled = await classOn(taught, today(), '15:00', '16:00');
    await su.query(
      `UPDATE class_session SET status = 'CANCELLED', cancel_reason = 'OTHER', cancelled_at = now() WHERE id = $1`,
      [cancelled],
    );
    const mine = await classOn(taught, today(), '16:00', '17:00');
    const ops: SyncOp[] = [
      markOp(notMine, allPresent()),
      markOp(cancelled, allPresent()),
      { ...markOp(mine, allPresent()), payload: { sessionId: mine, marks: [] } },
      { ...markOp(mine, allPresent()), type: 'homework.saveDraft', entityKey: 'draft:1' },
    ];
    const results = await push(teacher, ops);
    expect(results.map((r) => [r.status, r.error?.code, r.error?.message])).toEqual([
      ['REJECTED', 'NOT_FOUND', 'not_found'],
      ['REJECTED', 'INVALID_STATE_TRANSITION', 'cancelled'],
      ['REJECTED', 'VALIDATION_FAILED', 'invalid_payload'],
      ['REJECTED', 'VALIDATION_FAILED', 'unsupported_op'],
    ]);
    // An op whose key doesn't match its payload (alone: that class's key is held above).
    const [mismatch] = await push(teacher, [
      { ...markOp(mine, allPresent()), entityKey: 'session:00000000-0000-7000-8000-000000000001' },
    ]);
    expect(mismatch?.error?.message).toBe('entity_key_mismatch');
    // Resent: the same rejection, never silently "done".
    const [again] = await push(teacher, [ops[1]!]);
    expect(again).toMatchObject({ status: 'REJECTED', error: { message: 'cancelled' } });
    expect(await attendanceRows(cancelled)).toHaveLength(0);
  });

  it('per-entity order: after a conflict, later ops for that class wait; other classes go on', async () => {
    const contested = await classOn(taught, today(), '17:00', '18:00');
    const free = await classOn(taught, today(), '18:00', '19:00');
    // The owner marks a student absent online; the teacher's offline op never saw that.
    await http()
      .put(`/api/v1/sessions/${contested}/attendance`)
      .set('Host', owner.host)
      .set('Cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ marks: [{ studentId: students[0], status: 'ABSENT' }] })
      .expect(200);
    const conflicting = markOp(contested, [{ studentId: students[0], status: 'PRESENT' }]);
    const later = markOp(contested, [{ studentId: students[1], status: 'PRESENT' }]);
    const elsewhere = markOp(free, allPresent());
    const results = await push(teacher, [conflicting, later, elsewhere]);
    expect(results.map((r) => [r.opId, r.status])).toEqual([
      [conflicting.opId, 'CONFLICT'],
      [elsewhere.opId, 'APPLIED'],
    ]);
    const server = results[0]!.conflict!.server as {
      studentId: string;
      server: { status: string };
    }[];
    expect(server).toEqual([
      expect.objectContaining({
        studentId: students[0],
        server: expect.objectContaining({ status: 'ABSENT' }),
      }),
    ]);
    // Nothing from the held op was written.
    expect((await attendanceRows(contested)).map((r) => r.student_id)).toEqual([students[0]]);
    // The teacher resolves (keep mine) from the server version: a new op applies.
    const resolved = markOp(contested, [
      { studentId: students[0], status: 'PRESENT', baseVersion: 1 },
    ]);
    const [ok] = await push(teacher, [resolved]);
    expect(ok?.status).toBe('APPLIED');
  });

  it('bootstrap: the teacher’s own working set, basic profiles only; the accountant can’t', async () => {
    const mine = await classOn(taught, addDays(today(), 1));
    const theirs = await classOn(other, addDays(today(), 1));
    const res = await get(teacher, '/sync/bootstrap');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const snap = res.body as SyncSnapshot;
    expect(snap.batches.map((x) => x.id)).toEqual([taught]);
    expect(new Set(snap.enrolments.map((e) => e.batchId))).toEqual(new Set([taught]));
    expect(snap.students.map((s) => s.id).sort()).toEqual([...students].sort());
    expect(Object.keys(snap.students[0]!).sort()).toEqual([
      'admissionNo',
      'fullName',
      'id',
      'status',
    ]);
    expect(JSON.stringify(snap)).not.toContain('9840012345');
    const sessionIds = snap.sessions.map((s) => s.id);
    expect(sessionIds).toContain(mine);
    expect(sessionIds).not.toContain(theirs);
    expect(snap.attendanceComplete).toBe(true);
    expect(snap.window).toEqual({ from: addDays(today(), -7), to: addDays(today(), 14) });
    const accountant = await signIn(a, `accountant-${a.slug}@example.test`);
    expect((await get(accountant, '/sync/bootstrap')).status).toBe(403);
    const ownerSnap = (await get(owner, '/sync/bootstrap')).body as SyncSnapshot;
    expect(ownerSnap.sessions.map((s) => s.id)).toEqual(expect.arrayContaining([mine, theirs]));
  });

  it('pull: attendance changes since the watermark; a removed batch disappears; revocation', async () => {
    const first = (await get(teacher, '/sync/bootstrap')).body as SyncSnapshot;
    const sessionId = await classOn(taught, today(), '20:00', '21:00');
    await new Promise((r) => setTimeout(r, 50));
    await push(teacher, [markOp(sessionId, allPresent())]);
    const pulled = await get(teacher, `/sync/pull?since=${encodeURIComponent(first.watermark)}`);
    expect(pulled.status, JSON.stringify(pulled.body)).toBe(200);
    const delta = pulled.body as SyncSnapshot;
    expect(delta.attendanceComplete).toBe(false);
    expect(delta.attendance.filter((x) => x.sessionId === sessionId)).toHaveLength(3);
    expect(delta.sessions.map((s) => s.id)).toContain(sessionId);
    // A very old watermark: attendance comes whole again.
    const old = await get(
      teacher,
      `/sync/pull?since=${encodeURIComponent('2020-01-01T00:00:00Z')}`,
    );
    expect((old.body as SyncSnapshot).attendanceComplete).toBe(true);
    // Taken off the batch: it is simply absent from the next pull (the device drops it).
    await su.query(`DELETE FROM batch_teacher WHERE batch_id = $1 AND teacher_id = $2`, [
      taught,
      teacherProfile,
    ]);
    const after = (await get(teacher, `/sync/pull?since=${encodeURIComponent(delta.watermark)}`))
      .body as SyncSnapshot;
    expect(after.batches).toEqual([]);
    expect(after.sessions.filter((s) => s.id === sessionId)).toEqual([]);
    await su.query(
      `INSERT INTO batch_teacher (tenant_id, batch_id, teacher_id, is_primary) VALUES ($1, $2, $3, true)`,
      [a.id, taught, teacherProfile],
    );
    // Access ended: the device is told so it can wipe its data (ARCHITECTURE §11.7).
    await su.query(`UPDATE membership SET status = 'DISABLED' WHERE id = $1`, [
      teacherMember.membershipId,
    ]);
    await app.get(MembershipService).invalidate(a.id, teacherMember.userId);
    try {
      const revoked = await get(teacher, `/sync/pull?since=${encodeURIComponent(after.watermark)}`);
      expect(revoked.status).toBe(401);
      expect(revoked.body.error.code).toBe('MEMBERSHIP_REVOKED');
    } finally {
      await su.query(`UPDATE membership SET status = 'ACTIVE' WHERE id = $1`, [
        teacherMember.membershipId,
      ]);
      await app.get(MembershipService).invalidate(a.id, teacherMember.userId);
    }
  });

  it('beacon accepts queue health; another academy’s class is rejected as not found', async () => {
    const beacon = await post(teacher, '/sync/beacon', {
      pending: 3,
      failed: 0,
      conflicts: 1,
      oldestPendingAgeSec: 120,
      storagePersisted: true,
      resolved: { mine: 2, theirs: 1 },
    });
    expect(beacon.status).toBe(204);
    // Conflict choices become a counts-only analytics event (G-09).
    const { rows: events } = await su.query<{ properties: Record<string, unknown> }>(
      `SELECT payload->'properties' AS properties FROM outbox_event
        WHERE type = 'analytics.event' AND tenant_id = $1
          AND payload->>'name' = 'sync.conflict_resolved'`,
      [a.id],
    );
    expect(events.map((e) => e.properties)).toEqual([{ mine: 2, theirs: 1 }]);
    const theirs = b.people.sessionId;
    const results = await push(owner, [
      markOp(theirs, [{ studentId: b.people.studentId, status: 'PRESENT' }]),
    ]);
    expect(results[0]).toMatchObject({ status: 'REJECTED', error: { code: 'NOT_FOUND' } });
  });
});
