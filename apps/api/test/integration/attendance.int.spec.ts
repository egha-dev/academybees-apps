import {
  addDays,
  localDate,
  newId,
  ROLE_TEMPLATES,
  type RoleKey,
  type SessionAttendance,
} from '@academybee/contracts';
import {
  addMemberFixture,
  createTenantFixture,
  FIXTURE_PASSWORD,
  type Grant,
  type TenantFixture,
} from '@academybee/testing';
import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createTestApp } from '../support/test-app.js';

/**
 * Attendance (Phase 6 S1; ADR-017, C-126…C-131): roll calls saved atomically and exactly once,
 * the conflict rule, edit windows, scope, history, parent intents and percentages.
 */
const urls = inject('databaseUrls');

type Session = { host: string; cookie: string; csrf: string };
const templateGrants = (key: RoleKey): Grant[] =>
  Object.entries(ROLE_TEMPLATES[key].grants).map(([capability, scope]) => ({ capability, scope }));
const today = () => localDate(new Date(), 'Asia/Kolkata');

describe('attendance', () => {
  let app: INestApplication;
  let su: pg.Client;
  let a: TenantFixture;
  let b: TenantFixture;
  let owner: Session;
  let teacher: Session;
  let reception: Session;
  let accountant: Session;
  let taughtBatch: string;
  let otherBatch: string;
  let students: string[];
  const emails = { teacher: '', receptionist: '', accountant: '' };
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
    method: 'post' | 'patch' | 'put',
    path: string,
    body: unknown = {},
    key: string = crypto.randomUUID(),
  ) =>
    http()
      [method](`/api/v1${path}`)
      .set('Host', s.host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .set('Idempotency-Key', key)
      .send(body as object);

  /** A one-off class on `date` (academy-local times), straight in the table. */
  async function classOn(batchId: string, date: string, start = '10:00', end = '11:00') {
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
  /** Enrol students from 60 days ago (every day). */
  async function enrol(batchId: string, ids: string[]) {
    for (const studentId of ids)
      await su.query(
        `INSERT INTO batch_enrolment (id, tenant_id, batch_id, student_id, started_on, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_DATE - 60, now())`,
        [newId(), a.id, batchId, studentId],
      );
  }
  async function student(name: string): Promise<string> {
    const res = await send(owner, 'post', '/students', { fullName: name });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.id as string;
  }
  async function batch(name: string): Promise<string> {
    const res = await send(owner, 'post', '/batches', { name, courseId: a.people.courseId });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.id as string;
  }
  const marks = (status: string, ids = students) => ({
    marks: ids.map((studentId) => ({ studentId, status })),
  });
  const rows = async (sessionId: string) =>
    (
      await su.query<{ student_id: string; status: string; version: number }>(
        `SELECT student_id, status, version FROM attendance WHERE session_id = $1`,
        [sessionId],
      )
    ).rows;

  beforeAll(async () => {
    app = await createTestApp();
    su = new pg.Client({ connectionString: urls.superuser });
    await su.connect();
    [a, b] = await Promise.all([
      createTenantFixture(urls.migrator, { name: 'Attendance Academy', plan: 'pro' }),
      createTenantFixture(urls.migrator, { name: 'Other Attendance Academy', plan: 'pro' }),
    ]);
    const member = async (roleKey: 'teacher' | 'receptionist' | 'accountant') => {
      const m = await addMemberFixture(urls.migrator, a.id, {
        email: `${roleKey}-${a.slug}@example.test`,
        roleKey,
        grants: templateGrants(roleKey),
      });
      emails[roleKey] = `${roleKey}-${a.slug}@example.test`;
      return m;
    };
    const [t] = await Promise.all([
      member('teacher'),
      member('receptionist'),
      member('accountant'),
    ]);
    owner = await signIn(a, a.user.email);
    taughtBatch = await batch('Taught by Tara');
    otherBatch = await batch('Not Tara’s');
    const { rows: teacherRows } = await su.query<{ id: string }>(
      `INSERT INTO teacher (id, tenant_id, branch_id, membership_id, full_name, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Tara Teacher', now()) RETURNING id`,
      [a.id, a.branchId, t.membershipId],
    );
    await su.query(
      `INSERT INTO batch_teacher (tenant_id, batch_id, teacher_id, is_primary) VALUES ($1, $2, $3, true)`,
      [a.id, taughtBatch, teacherRows[0]!.id],
    );
    students = [];
    for (const name of ['Asha Rao', 'Bala Iyer', 'Chitra Nair']) students.push(await student(name));
    await enrol(taughtBatch, students);
    await enrol(otherBatch, students);
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
    teacher = await signIn(a, emails.teacher);
    reception = await signIn(a, emails.receptionist);
    accountant = await signIn(a, emails.accountant);
  });

  it('a roll call: expected students, Mark all present then exceptions, history, completion, intents', async () => {
    const sessionId = await classOn(taughtBatch, today());
    const roll = await get(teacher, `/sessions/${sessionId}/attendance`);
    expect(roll.status, JSON.stringify(roll.body)).toBe(200);
    const before = roll.body as SessionAttendance;
    expect(before.students.map((s) => s.studentId).sort()).toEqual([...students].sort());
    expect(before.counts).toMatchObject({ unmarked: 3, PRESENT: 0 });
    expect(before.locked).toBeNull();

    const saved = await send(teacher, 'put', `/sessions/${sessionId}/attendance`, {
      marks: [
        { studentId: students[0], status: 'PRESENT' },
        { studentId: students[1], status: 'PRESENT' },
        { studentId: students[2], status: 'ABSENT', note: 'Unwell' },
      ],
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect((saved.body as SessionAttendance).counts).toMatchObject({
      PRESENT: 2,
      ABSENT: 1,
      unmarked: 0,
    });
    expect((await rows(sessionId)).every((r) => r.version === 1)).toBe(true);
    const { rows: s } = await su.query(`SELECT status FROM class_session WHERE id = $1`, [
      sessionId,
    ]);
    expect(s[0].status).toBe('COMPLETED');
    const { rows: changes } = await su.query(
      `SELECT c.to_status FROM attendance_change c JOIN attendance t ON t.id = c.attendance_id
        WHERE t.session_id = $1`,
      [sessionId],
    );
    expect(changes).toHaveLength(3);
    const { rows: intents } = await su.query(
      `SELECT kind, status, student_id, payload FROM notification_intent WHERE session_id = $1`,
      [sessionId],
    );
    expect(intents).toEqual([
      expect.objectContaining({
        kind: 'ATTENDANCE_ABSENT',
        status: 'PENDING',
        student_id: students[2],
        payload: expect.objectContaining({ batchName: 'Taught by Tara', start: '10:00' }),
      }),
    ]);
    // Correcting the absence to present voids the pending notice; no new history for a no-op.
    const fixed = await send(teacher, 'put', `/sessions/${sessionId}/attendance`, marks('PRESENT'));
    expect(fixed.status).toBe(200);
    const { rows: after } = await su.query(
      `SELECT status FROM notification_intent WHERE session_id = $1`,
      [sessionId],
    );
    expect(after).toEqual([{ status: 'VOID' }]);
    const { rows: changes2 } = await su.query(
      `SELECT count(*)::int AS n FROM attendance_change c JOIN attendance t ON t.id = c.attendance_id
        WHERE t.session_id = $1`,
      [sessionId],
    );
    expect(changes2[0].n).toBe(4);
  });

  it('exactly once: a replayed request and 50 concurrent saves leave one mark per student', async () => {
    const sessionId = await classOn(taughtBatch, today(), '12:00', '13:00');
    const key = crypto.randomUUID();
    const first = await send(
      owner,
      'put',
      `/sessions/${sessionId}/attendance`,
      marks('PRESENT'),
      key,
    );
    const replay = await send(
      owner,
      'put',
      `/sessions/${sessionId}/attendance`,
      marks('PRESENT'),
      key,
    );
    expect([first.status, replay.status]).toEqual([200, 200]);
    const burst = await Promise.all(
      Array.from({ length: 50 }, () =>
        send(owner, 'put', `/sessions/${sessionId}/attendance`, marks('PRESENT')),
      ),
    );
    expect(burst.every((r) => r.status === 200)).toBe(true);
    const saved = await rows(sessionId);
    expect(saved).toHaveLength(3);
    expect(saved.every((r) => r.version === 1)).toBe(true);
  });

  it('the conflict rule (ADR-017): stale edits by the same person apply; over someone else’s, 409', async () => {
    const sessionId = await classOn(taughtBatch, today(), '14:00', '15:00');
    const [s1] = students;
    await send(owner, 'put', `/sessions/${sessionId}/attendance`, {
      marks: [{ studentId: s1, status: 'ABSENT' }],
    });
    // The teacher edits from version 1 → applied (version 2).
    const teacherEdit = await send(teacher, 'put', `/sessions/${sessionId}/attendance`, {
      marks: [{ studentId: s1, status: 'PRESENT', baseVersion: 1 }],
    });
    expect(teacherEdit.status, JSON.stringify(teacherEdit.body)).toBe(200);
    // The owner, still on version 1, changes it to late → conflict, nothing written.
    const stale = await send(owner, 'put', `/sessions/${sessionId}/attendance`, {
      marks: [
        { studentId: s1, status: 'LATE', baseVersion: 1 },
        { studentId: students[1], status: 'PRESENT' },
      ],
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.details).toEqual([{ path: `marks.${s1}`, issue: 'changed_by_other' }]);
    expect((await rows(sessionId)).map((r) => r.student_id)).toEqual([s1]);
    // The same value from a stale base is a no-op; a fresh base applies.
    const same = await send(owner, 'put', `/sessions/${sessionId}/attendance`, {
      marks: [{ studentId: s1, status: 'PRESENT', baseVersion: 1 }],
    });
    expect(same.status).toBe(200);
    const fresh = await send(owner, 'put', `/sessions/${sessionId}/attendance`, {
      marks: [{ studentId: s1, status: 'LATE', baseVersion: 2 }],
    });
    expect(fresh.status).toBe(200);
    expect((await rows(sessionId))[0]).toMatchObject({ status: 'LATE', version: 3 });
    // PATCH one mark: same rule, from the version the user saw.
    const roll = (await get(owner, `/sessions/${sessionId}/attendance`)).body as SessionAttendance;
    const mark = roll.students.find((s) => s.studentId === s1)!.attendance!;
    const patched = await send(teacher, 'patch', `/attendance/${mark.id}`, {
      version: 1,
      status: 'ABSENT',
    });
    expect(patched.status).toBe(409);
    const ok = await send(teacher, 'patch', `/attendance/${mark.id}`, {
      version: mark.version,
      status: 'ABSENT',
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  });

  it('who may: teachers only their classes; reception reads; the accountant neither', async () => {
    const mine = await classOn(taughtBatch, today(), '16:00', '17:00');
    const notMine = await classOn(otherBatch, today(), '16:00', '17:00');
    expect((await get(teacher, `/sessions/${notMine}/attendance`)).status).toBe(404);
    expect(
      (await send(teacher, 'put', `/sessions/${notMine}/attendance`, marks('PRESENT'))).status,
    ).toBe(404);
    expect((await get(reception, `/sessions/${mine}/attendance`)).status).toBe(200);
    expect(
      (await send(reception, 'put', `/sessions/${mine}/attendance`, marks('PRESENT'))).status,
    ).toBe(403);
    expect((await get(accountant, `/sessions/${mine}/attendance`)).status).toBe(403);
    // A student not on this class's roll can't be marked.
    const stranger = await student('Not Enrolled');
    const off = await send(owner, 'put', `/sessions/${mine}/attendance`, {
      marks: [{ studentId: stranger, status: 'PRESENT' }],
    });
    expect(off.status).toBe(400);
    expect(off.body.error.details).toEqual([{ path: 'marks.0.studentId', issue: 'not_on_roll' }]);
  });

  it('locks: cancelled and future classes, and the 48-hour window for teachers (C-129, C-130)', async () => {
    const cancelled = await classOn(taughtBatch, today(), '18:00', '19:00');
    await su.query(
      `UPDATE class_session SET status = 'CANCELLED', cancel_reason = 'OTHER', cancelled_at = now() WHERE id = $1`,
      [cancelled],
    );
    const tomorrow = await classOn(taughtBatch, addDays(today(), 1));
    const old = await classOn(taughtBatch, addDays(today(), -3));
    const issue = async (s: Session, id: string) => {
      const res = await send(s, 'put', `/sessions/${id}/attendance`, marks('PRESENT'));
      const body = res.body as { error?: { details?: { issue: string }[] } };
      return [res.status, body.error?.details?.[0]?.issue];
    };
    expect(await issue(owner, cancelled)).toEqual([409, 'cancelled']);
    expect(await issue(owner, tomorrow)).toEqual([409, 'not_yet']);
    expect(await issue(teacher, old)).toEqual([409, 'window_closed']);
    expect((await get(teacher, `/sessions/${old}/attendance`)).body.locked).toBe('window_closed');
    // The owner holds attendance.edit_past.
    expect((await send(owner, 'put', `/sessions/${old}/attendance`, marks('PRESENT'))).status).toBe(
      200,
    );
  });

  it('history and percentages: a student by month, a batch over a range, the day’s overview', async () => {
    const day1 = await classOn(otherBatch, addDays(today(), -2), '07:00', '08:00');
    const day2 = await classOn(otherBatch, addDays(today(), -1), '07:00', '08:00');
    const [s1, s2] = students;
    await send(owner, 'put', `/sessions/${day1}/attendance`, {
      marks: [
        { studentId: s1, status: 'PRESENT' },
        { studentId: s2, status: 'LEAVE' },
      ],
    });
    await send(owner, 'put', `/sessions/${day2}/attendance`, {
      marks: [
        { studentId: s1, status: 'ABSENT' },
        { studentId: s2, status: 'LATE' },
      ],
    });
    const history = await get(owner, `/students/${s1}/attendance?months=2`);
    expect(history.status, JSON.stringify(history.body)).toBe(200);
    expect(
      (history.body.items as { batchId: string }[]).filter((i) => i.batchId === otherBatch),
    ).toHaveLength(2);
    expect(history.body.months).toHaveLength(2);
    const range = await get(
      owner,
      `/batches/${otherBatch}/attendance?from=${addDays(today(), -2)}&to=${addDays(today(), -1)}`,
    );
    expect(range.status, JSON.stringify(range.body)).toBe(200);
    const byId = new Map(
      (range.body.sessions as { sessionId: string; counts: object }[]).map((s) => [
        s.sessionId,
        s.counts,
      ]),
    );
    expect(byId.get(day1)).toMatchObject({ PRESENT: 1, LEAVE: 1, unmarked: 1 });
    // s1: present, absent; s2: leave (left out), late → 2 attended of 3 counted.
    expect(range.body.percent).toBe(66.7);
    const overview = await get(owner, `/attendance/overview?date=${addDays(today(), -1)}`);
    expect(overview.status).toBe(200);
    const row = (overview.body.sessions as { sessionId: string }[]).find(
      (s) => s.sessionId === day2,
    );
    expect(row).toMatchObject({ state: 'taken', batchName: 'Not Tara’s' });
  });

  it('a 60-student roll call saves quickly (perf smoke)', async () => {
    const big = await batch('Big class');
    const ids: string[] = [];
    for (let i = 0; i < 60; i++) {
      const id = newId();
      await su.query(
        `INSERT INTO student (id, tenant_id, branch_id, admission_no, full_name, admission_date, updated_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, now())`,
        [id, a.id, a.branchId, `PERF-${i}`, `Perf Student ${i}`],
      );
      ids.push(id);
    }
    await enrol(big, ids);
    const times: number[] = [];
    for (let run = 0; run < 10; run++) {
      const sessionId = await classOn(big, today(), `0${run}:00`.slice(-5), `0${run}:30`.slice(-5));
      const started = performance.now();
      const res = await send(owner, 'put', `/sessions/${sessionId}/attendance`, {
        marks: ids.map((studentId, i) => ({ studentId, status: i % 7 ? 'PRESENT' : 'ABSENT' })),
      });
      times.push(performance.now() - started);
      expect(res.status).toBe(200);
    }
    times.sort((x, y) => x - y);
    const p95 = times[Math.ceil(times.length * 0.95) - 1]!;
    console.info(`60-student roll call p95: ${p95.toFixed(0)} ms`);
    // Budget 300 ms p95 on a developer machine; CI runners get headroom.
    expect(p95).toBeLessThan(1500);
  });

  it('another academy’s classes and marks are 404', async () => {
    const other = await signIn(b, b.user.email);
    const sessionId = await classOn(taughtBatch, today(), '20:00', '21:00');
    await send(owner, 'put', `/sessions/${sessionId}/attendance`, marks('PRESENT'));
    const mark = ((await get(owner, `/sessions/${sessionId}/attendance`)).body as SessionAttendance)
      .students[0]!.attendance!;
    expect((await get(other, `/sessions/${sessionId}/attendance`)).status).toBe(404);
    expect(
      (await send(other, 'put', `/sessions/${sessionId}/attendance`, marks('ABSENT'))).status,
    ).toBe(404);
    expect(
      (await send(other, 'patch', `/attendance/${mark.id}`, { version: 1, status: 'ABSENT' }))
        .status,
    ).toBe(404);
    expect(
      (await get(other, `/batches/${taughtBatch}/attendance?from=${today()}&to=${today()}`)).status,
    ).toBe(404);
    expect((await get(other, `/students/${students[0]}/attendance`)).status).toBe(404);
    // Another academy's student in this academy's roll call is not on the roll.
    const theirs = b.people.studentId;
    const foreign = await send(owner, 'put', `/sessions/${sessionId}/attendance`, {
      marks: [{ studentId: theirs, status: 'PRESENT' }],
    });
    expect(foreign.status).toBe(400);
  });
});
