import {
  addDays,
  type Batch,
  isoWeekday,
  localDate,
  newId,
  ROLE_TEMPLATES,
  type RoleKey,
  type Schedule,
  type Session,
} from '@academybee/contracts';
import {
  addMemberFixture,
  createTenantFixture,
  FIXTURE_PASSWORD,
  type Grant,
  type TenantFixture,
} from '@academybee/testing';
import type { INestApplication } from '@nestjs/common';
import type { Job } from 'bullmq';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';

import { SessionGenerationProcessor } from '../../src/modules/scheduling/generation.processor.js';
import type { SessionGenerationJob } from '../../src/modules/scheduling/generation.queue.js';
import { createTestApp } from '../support/test-app.js';

/**
 * Weekly patterns, sessions and holidays (Phase 5 S3; ADR-024, ADR-037, G-03; C-113…C-115,
 * C-120, C-121): real scheduling patterns, edits that never overwrite staff changes, extra and
 * make-up classes, double-booking warnings, and holidays that cancel exactly the right classes.
 */
const urls = inject('databaseUrls');

type Session_ = { host: string; cookie: string; csrf: string };
const templateGrants = (key: RoleKey): Grant[] =>
  Object.entries(ROLE_TEMPLATES[key].grants).map(([capability, scope]) => ({ capability, scope }));
const today = () => localDate(new Date(), 'Asia/Kolkata');
/** The first `weekday` at least `ahead` days from today (academy-local). */
const next = (weekday: number, ahead = 2) => {
  let d = addDays(today(), ahead);
  while (isoWeekday(d) !== weekday) d = addDays(d, 1);
  return d;
};

describe('weekly patterns, sessions and holidays', () => {
  let app: INestApplication;
  let su: pg.Client;
  let a: TenantFixture;
  let b: TenantFixture;
  let owner: Session_;
  const http = () => request(app.getHttpServer());

  async function signIn(t: TenantFixture, email: string): Promise<Session_> {
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
  const get = (s: Session_, path: string) =>
    http().get(`/api/v1${path}`).set('Host', s.host).set('Cookie', s.cookie);
  const send = (
    s: Session_,
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

  async function batch(name: string, teacherIds = [a.people.teacherId]): Promise<Batch> {
    const res = await send(owner, 'post', '/batches', {
      name,
      courseId: a.people.courseId,
      teacherIds,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as Batch;
  }
  async function schedule(batchId: string, slots: unknown[], from?: string): Promise<Schedule> {
    const res = await send(owner, 'put', `/batches/${batchId}/schedule`, {
      slots,
      ...(from ? { from } : {}),
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as Schedule;
  }
  async function sessionsOf(batchId: string) {
    return (
      await su.query<{
        id: string;
        d: string;
        status: string;
        start: string;
        reason: string | null;
      }>(
        `SELECT id, session_date::text AS d, status, cancel_reason AS reason,
                to_char(starts_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS start
           FROM class_session WHERE batch_id = $1 ORDER BY starts_at`,
        [batchId],
      )
    ).rows;
  }
  const slot = (weekday: number, start: string, end: string) => ({ weekday, start, end });

  beforeAll(async () => {
    app = await createTestApp();
    su = new pg.Client({ connectionString: urls.superuser });
    await su.connect();
    [a, b] = await Promise.all([
      createTenantFixture(urls.migrator, { name: 'Schedule Academy', plan: 'pro' }),
      createTenantFixture(urls.migrator, { name: 'Other Schedule Academy', plan: 'pro' }),
    ]);
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
  });

  it('2, 3 and 7 classes a week, each slot at its own time; overlapping slots refused', async () => {
    const mwf = await batch('Karate Mon/Wed/Fri');
    const s1 = await schedule(
      mwf.id,
      [1, 3, 5].map((d) => slot(d, '18:00', '19:00')),
    );
    expect(s1.slots.map((s) => s.weekday)).toEqual([1, 3, 5]);
    const rows = await sessionsOf(mwf.id);
    expect(rows.length).toBeGreaterThanOrEqual(11);
    expect(rows.every((r) => [1, 3, 5].includes(isoWeekday(r.d)) && r.start === '18:00')).toBe(
      true,
    );

    const music = await batch('Music Tue/Sat');
    await schedule(music.id, [slot(2, '17:00', '18:00'), slot(6, '10:00', '11:30')]);
    const m = await sessionsOf(music.id);
    expect(
      m.every((r) => (isoWeekday(r.d) === 2 ? r.start === '17:00' : r.start === '10:00')),
    ).toBe(true);
    expect(new Set(m.map((r) => isoWeekday(r.d)))).toEqual(new Set([2, 6]));

    const fitness = await batch('Fitness daily', []);
    await schedule(
      fitness.id,
      [1, 2, 3, 4, 5, 6, 7].map((d) => slot(d, '06:00', '07:00')),
    );
    expect((await sessionsOf(fitness.id)).length).toBeGreaterThanOrEqual(27);

    const overlap = await send(owner, 'put', `/batches/${fitness.id}/schedule`, {
      slots: [slot(1, '06:00', '07:00'), slot(1, '06:30', '07:30')],
    });
    expect(overlap.status).toBe(400);
  });

  it('a change from a date keeps classes staff changed and flags day plans on removed days', async () => {
    const tuition = await batch('Tuition Mon–Fri');
    await schedule(
      tuition.id,
      [1, 2, 3, 4, 5].map((d) => slot(d, '17:00', '18:00')),
    );
    // A student who comes only on Fridays.
    const kid = await send(owner, 'post', '/students', { fullName: 'Friday Kid' });
    await send(owner, 'post', `/batches/${tuition.id}/enrolments`, {
      studentId: kid.body.id,
      weekdays: [5],
    });
    // Staff move one Wednesday class to 18:30.
    const wed = next(3);
    const moved = (await sessionsOf(tuition.id)).find((r) => r.d === wed)!;
    const before = (await get(owner, `/sessions?from=${wed}&to=${wed}&batchId=${tuition.id}`)).body
      .items[0] as Session;
    const patch = await send(owner, 'patch', `/sessions/${moved.id}`, {
      version: before.version,
      start: '18:30',
      end: '19:30',
    });
    expect(patch.status, JSON.stringify(patch.body)).toBe(200);
    expect(patch.body.session).toMatchObject({ start: '18:30', changed: true });
    // From tomorrow: Mon/Wed only, 18:45 — overlapping the moved class on that Wednesday.
    const from = addDays(today(), 1);
    const after = await schedule(
      tuition.id,
      [slot(1, '18:45', '19:45'), slot(3, '18:45', '19:45')],
      from,
    );
    expect(after.plansOutside).toEqual([
      expect.objectContaining({ studentName: 'Friday Kid', weekdays: [5] }),
    ]);
    const rows = await sessionsOf(tuition.id);
    const onWed = rows.filter((r) => r.d === wed);
    // The moved class stays and no second class appears at the overlapping time.
    expect(onWed).toEqual([expect.objectContaining({ id: moved.id, start: '18:30' })]);
    const future = rows.filter((r) => r.d >= from && r.d !== wed);
    expect(future.every((r) => [1, 3].includes(isoWeekday(r.d)) && r.start === '18:45')).toBe(true);
  });

  it('extra and make-up classes, cancel and restore, double bookings, started classes locked', async () => {
    const x = await batch('Morning A');
    const y = await batch('Morning B');
    await schedule(x.id, [slot(3, '09:00', '10:00')]);
    // Same teacher, overlapping time on Wednesdays: a warning, not a refusal.
    const clash = await schedule(y.id, [slot(3, '09:30', '10:30')]);
    expect(clash.doubleBookings.length).toBeGreaterThan(0);
    expect(clash.doubleBookings[0]).toMatchObject({ otherBatchName: 'Morning A' });

    const day = next(4, 3);
    const extra = await send(owner, 'post', '/sessions', {
      batchId: x.id,
      date: day,
      start: '16:00',
      end: '17:00',
    });
    expect(extra.status, JSON.stringify(extra.body)).toBe(201);
    expect(extra.body.session).toMatchObject({ origin: 'MANUAL', date: day, start: '16:00' });

    const wed = (await sessionsOf(x.id)).find(
      (r) => r.status === 'SCHEDULED' && isoWeekday(r.d) === 3,
    )!;
    const list = await get(owner, `/sessions?from=${wed.d}&to=${wed.d}&batchId=${x.id}`);
    const target = list.body.items[0] as Session;
    const notCancelled = await send(owner, 'post', '/sessions', {
      batchId: x.id,
      date: day,
      start: '18:00',
      end: '19:00',
      makeupForSessionId: target.id,
    });
    expect(notCancelled.status).toBe(400);
    const cancelled = await send(owner, 'post', `/sessions/${target.id}/cancel`, {
      version: target.version,
      reason: 'TEACHER_UNAVAILABLE',
    });
    expect(cancelled.body.session).toMatchObject({
      status: 'CANCELLED',
      cancelReason: 'TEACHER_UNAVAILABLE',
    });
    const makeup = await send(owner, 'post', '/sessions', {
      batchId: x.id,
      date: day,
      start: '18:00',
      end: '19:00',
      makeupForSessionId: target.id,
    });
    expect(makeup.status).toBe(201);
    expect(makeup.body.session.makeupForSessionId).toBe(target.id);
    const restored = await send(owner, 'post', `/sessions/${target.id}/restore`, {
      version: cancelled.body.session.version,
    });
    expect(restored.body.session).toMatchObject({ status: 'SCHEDULED', changed: true });

    // A class that has already started can't be moved.
    const past = newId();
    await su.query(
      `INSERT INTO class_session (id, tenant_id, branch_id, batch_id, session_date, starts_at, ends_at, origin, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_DATE, now() - interval '10 minutes', now() + interval '50 minutes', 'MANUAL', now())`,
      [past, a.id, a.branchId, x.id],
    );
    const locked = await send(owner, 'patch', `/sessions/${past}`, {
      version: 1,
      start: '20:00',
      end: '21:00',
    });
    expect(locked.status).toBeGreaterThanOrEqual(400);
    expect(locked.body.error.details).toEqual([{ path: 'startsAt', issue: 'started' }]);
  });

  it('a teacher’s timetable shows only the classes they teach', async () => {
    const t = await addMemberFixture(urls.migrator, a.id, {
      email: `teacher-${a.slug}@example.test`,
      roleKey: 'teacher',
      grants: templateGrants('teacher'),
    });
    const { rows } = await su.query<{ id: string }>(
      `INSERT INTO teacher (id, tenant_id, branch_id, membership_id, full_name, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Tara Teacher', now()) RETURNING id`,
      [a.id, a.branchId, t.membershipId],
    );
    const mine = await batch('Tara’s batch', [rows[0]!.id]);
    await schedule(mine.id, [slot(isoWeekday(addDays(today(), 3)), '15:00', '16:00')]);
    const session = await signIn(a, t.email);
    const range = await get(session, `/sessions?from=${today()}&to=${addDays(today(), 13)}`);
    expect(range.status).toBe(200);
    const batches = new Set((range.body.items as Session[]).map((s) => s.batchId));
    expect([...batches]).toEqual([mine.id]);
    expect(
      (await get(session, `/sessions?from=${today()}&to=${addDays(today(), 40)}`)).status,
    ).toBe(400);
  });

  it('a holiday previews and cancels exactly its classes, notices expected children, and can be removed', async () => {
    const daily = await batch('Daily dance', []);
    await schedule(
      daily.id,
      [1, 2, 3, 4, 5, 6, 7].map((d) => slot(d, '07:00', '08:00')),
    );
    const everyDay = await send(owner, 'post', '/students', { fullName: 'Every Day' });
    const saturdays = await send(owner, 'post', '/students', { fullName: 'Saturday Only' });
    await send(owner, 'post', `/batches/${daily.id}/enrolments`, { studentId: everyDay.body.id });
    await send(owner, 'post', `/batches/${daily.id}/enrolments`, {
      studentId: saturdays.body.id,
      weekdays: [6],
    });
    const diwali = next(3, 3);
    const input = { name: 'Diwali', startDate: diwali, endDate: diwali };
    const preview = await send(owner, 'post', '/holidays/preview', input);
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect(preview.body.days).toHaveLength(1);
    const previewed = preview.body.days[0].sessions as { batchName: string }[];
    expect(previewed.map((s) => s.batchName)).toContain('Daily dance');
    const created = await send(owner, 'post', '/holidays', input);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.cancelled).toBe(preview.body.totals.sessions);
    const onDay = (await sessionsOf(daily.id)).filter((r) => r.d === diwali);
    expect(onDay).toEqual([expect.objectContaining({ status: 'CANCELLED', reason: 'HOLIDAY' })]);
    const intents = await su.query<{ student_id: string; status: string }>(
      `SELECT student_id, status FROM notification_intent WHERE holiday_id = $1`,
      [created.body.holiday.id],
    );
    const ids = intents.rows.map((r) => r.student_id);
    expect(ids).toContain(everyDay.body.id);
    expect(ids).not.toContain(saturdays.body.id);
    // The nightly job never refills the holiday; the class can't be restored by hand.
    await app
      .get(SessionGenerationProcessor)
      .process({ data: { tenantId: a.id, reason: 'manual' } } as Job<SessionGenerationJob>);
    expect((await sessionsOf(daily.id)).filter((r) => r.d === diwali)).toHaveLength(1);
    const listed = await get(owner, `/sessions?from=${diwali}&to=${diwali}&batchId=${daily.id}`);
    const cancelledSession = listed.body.items[0] as Session;
    expect(cancelledSession.holidayName).toBe('Diwali');
    expect(listed.body.holidays).toEqual([expect.objectContaining({ name: 'Diwali' })]);
    expect(
      (
        await send(owner, 'post', `/sessions/${cancelledSession.id}/restore`, {
          version: cancelledSession.version,
        })
      ).status,
    ).toBe(409);
    // Removing it brings the class back and voids the notices.
    const removed = await send(owner, 'delete', `/holidays/${created.body.holiday.id}`);
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    expect((await sessionsOf(daily.id)).filter((r) => r.d === diwali)).toEqual([
      expect.objectContaining({ status: 'SCHEDULED', reason: null }),
    ]);
    const voided = await su.query(
      `SELECT DISTINCT status FROM notification_intent WHERE holiday_id = $1`,
      [created.body.holiday.id],
    );
    expect(voided.rows).toEqual([{ status: 'VOID' }]);
    // Not in the past.
    expect(
      (
        await send(owner, 'post', '/holidays/preview', {
          name: 'Old',
          startDate: addDays(today(), -3),
          endDate: today(),
        })
      ).status,
    ).toBe(400);
  });

  it('Today: today’s classes in the academy’s day, and what needs attention', async () => {
    const lonely = await batch('Nobody teaches', []);
    await schedule(lonely.id, [slot(isoWeekday(addDays(today(), 2)), '20:00', '21:00')]);
    const full = await send(owner, 'post', '/batches', {
      name: 'Full on Mondays',
      courseId: a.people.courseId,
      capacity: 1,
      teacherIds: [a.people.teacherId],
    });
    await schedule(full.body.id, [slot(1, '16:00', '17:00')]);
    const kid = await send(owner, 'post', '/students', { fullName: 'Seat Taker' });
    await send(owner, 'post', `/batches/${full.body.id}/enrolments`, { studentId: kid.body.id });
    const res = await get(owner, '/today');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.date).toBe(today());
    expect((res.body.sessions as Session[]).every((s) => s.date === today())).toBe(true);
    const attention = res.body.attention as {
      batchesWithoutTeacher: { id: string }[];
      batchesFull: { id: string; students: number; capacity: number }[];
      sessionsWithoutTeacher: number;
    };
    expect(attention.batchesWithoutTeacher.map((b) => b.id)).toContain(lonely.id);
    expect(attention.batchesFull).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: full.body.id, students: 1, capacity: 1 }),
      ]),
    );
    expect(attention.sessionsWithoutTeacher).toBeGreaterThanOrEqual(1);
    expect((res.body.recent as { batchId: string }[]).length).toBeGreaterThan(0);
  });

  it('"today" is the academy’s date, not the server’s: at 19:00 UTC India is already tomorrow (C-119)', async () => {
    // Freeze only Date: sign in and read under the frozen clock, so tokens stay valid.
    const utcDay = new Date().toISOString().slice(0, 10);
    const frozen = new Date(`${utcDay}T19:00:00Z`);
    const indiaDay = addDays(utcDay, 1);
    vi.useFakeTimers({ toFake: ['Date'], now: frozen });
    try {
      expect(localDate(new Date(), 'Asia/Kolkata')).toBe(indiaDay);
      const late = await signIn(a, a.user.email);
      const res = await get(late, '/today');
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.date).toBe(indiaDay);
      expect((res.body.sessions as Session[]).every((x) => x.date === indiaDay)).toBe(true);
      const list = await get(late, `/sessions?from=${indiaDay}&to=${indiaDay}`);
      expect(list.status).toBe(200);
      expect(list.body.today).toBe(indiaDay);
    } finally {
      vi.useRealTimers();
    }
  });

  it('saving a weekly pattern again the same day replaces it without doubling classes (review H1)', async () => {
    const twice = await batch('Saved twice');
    await schedule(
      twice.id,
      [1, 3, 5].map((d) => slot(d, '18:00', '19:00')),
    );
    const again = await schedule(
      twice.id,
      [2, 4].map((d) => slot(d, '17:00', '18:00')),
    );
    expect(again.slots.map((x) => x.weekday)).toEqual([2, 4]);
    let rows = await sessionsOf(twice.id);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => [2, 4].includes(isoWeekday(r.d)) && r.start === '17:00')).toBe(true);
    // A future-dated change, then a save from an earlier date: both earlier sets are replaced.
    await schedule(twice.id, [slot(6, '09:00', '10:00')], addDays(today(), 7));
    await schedule(twice.id, [slot(1, '18:00', '19:00')]);
    rows = await sessionsOf(twice.id);
    expect(rows.every((r) => isoWeekday(r.d) === 1)).toBe(true);
    // Two saves at once: one class per day, never two.
    await Promise.all([
      schedule(twice.id, [slot(3, '18:00', '19:00')]),
      schedule(twice.id, [slot(3, '18:00', '19:00')]),
    ]);
    rows = (await sessionsOf(twice.id)).filter((r) => r.status === 'SCHEDULED');
    expect(rows.every((r) => isoWeekday(r.d) === 3)).toBe(true);
    expect(new Set(rows.map((r) => r.d)).size).toBe(rows.length);
  });

  it('a class moved to another day is not recreated on its original day (review H2)', async () => {
    const moves = await batch('Moves');
    await schedule(moves.id, [slot(3, '18:00', '19:00')]);
    const wed = next(3, 3);
    const thu = addDays(wed, 1);
    const listed = await get(owner, `/sessions?from=${wed}&to=${wed}&batchId=${moves.id}`);
    const session = listed.body.items[0] as Session;
    const moved = await send(owner, 'patch', `/sessions/${session.id}`, {
      version: session.version,
      date: thu,
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    await app
      .get(SessionGenerationProcessor)
      .process({ data: { tenantId: a.id, reason: 'manual' } } as Job<SessionGenerationJob>);
    const rows = await sessionsOf(moves.id);
    expect(rows.filter((r) => r.d === wed)).toHaveLength(0);
    expect(rows.filter((r) => r.d === thu)).toHaveLength(1);
  });

  it('removing a holiday brings back only classes the pattern still has (review M1)', async () => {
    const changed = await batch('Fridays, then Tuesdays', []);
    await schedule(changed.id, [slot(5, '18:00', '19:00')]);
    const fri = next(5, 8);
    const holiday = await send(owner, 'post', '/holidays', {
      name: 'Founders',
      startDate: fri,
      endDate: fri,
    });
    expect(holiday.status, JSON.stringify(holiday.body)).toBe(201);
    await schedule(changed.id, [slot(2, '18:00', '19:00')], addDays(today(), 1));
    const removed = await send(owner, 'delete', `/holidays/${holiday.body.holiday.id}`);
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    const rows = await sessionsOf(changed.id);
    expect(rows.filter((r) => r.d === fri)).toHaveLength(0);
    expect(rows.filter((r) => r.d > today()).every((r) => isoWeekday(r.d) === 2)).toBe(true);
  });

  it('archiving a batch clears its future classes; restoring brings them back (review M2)', async () => {
    const archived = await batch('Archive me');
    await schedule(archived.id, [slot(1, '18:00', '19:00')]);
    const upcoming = () =>
      sessionsOf(archived.id).then((rows) =>
        rows.filter((r) => r.d > today() && r.status === 'SCHEDULED'),
      );
    expect((await upcoming()).length).toBeGreaterThan(0);
    const current = await get(owner, `/batches/${archived.id}`);
    const off = await send(owner, 'patch', `/batches/${archived.id}`, {
      version: current.body.version,
      status: 'ARCHIVED',
    });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    expect(await upcoming()).toHaveLength(0);
    const on = await send(owner, 'patch', `/batches/${archived.id}`, {
      version: off.body.version,
      status: 'ACTIVE',
    });
    expect(on.status, JSON.stringify(on.body)).toBe(200);
    expect((await upcoming()).length).toBeGreaterThan(0);
  });

  it('a class or slot teacher must be a current teacher of this academy (review M3)', async () => {
    const checked = await batch('Teacher check');
    await schedule(checked.id, [slot(2, '18:00', '19:00')]);
    const tue = next(2, 3);
    const listed = await get(owner, `/sessions?from=${tue}&to=${tue}&batchId=${checked.id}`);
    const session = listed.body.items[0] as Session;
    const foreign = b.people.teacherId;
    const moved = await send(owner, 'patch', `/sessions/${session.id}`, {
      version: session.version,
      teacherId: foreign,
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(404);
    const extra = await send(owner, 'post', '/sessions', {
      batchId: checked.id,
      date: tue,
      start: '20:00',
      end: '21:00',
      teacherId: foreign,
    });
    expect(extra.status, JSON.stringify(extra.body)).toBe(404);
    const pattern = await send(owner, 'put', `/batches/${checked.id}/schedule`, {
      slots: [{ ...slot(4, '18:00', '19:00'), teacherId: foreign }],
    });
    expect(pattern.status, JSON.stringify(pattern.body)).toBe(404);
  });

  it('another academy’s schedule, sessions and holidays are 404', async () => {
    const other = await signIn(b, b.user.email);
    const batchId = a.people.batchId;
    const sessionId = a.people.sessionId;
    expect((await get(other, `/batches/${batchId}/schedule`)).status).toBe(404);
    expect(
      (
        await send(other, 'put', `/batches/${batchId}/schedule`, {
          slots: [slot(1, '10:00', '11:00')],
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await send(other, 'post', '/sessions', {
          batchId,
          date: next(2, 3),
          start: '10:00',
          end: '11:00',
        })
      ).status,
    ).toBe(404);
    expect(
      (await send(other, 'patch', `/sessions/${sessionId}`, { version: 1, note: 'x' })).status,
    ).toBe(404);
    expect(
      (await send(other, 'post', `/sessions/${sessionId}/cancel`, { version: 1, reason: 'OTHER' }))
        .status,
    ).toBe(404);
    expect(
      (await send(other, 'post', `/sessions/${sessionId}/restore`, { version: 1 })).status,
    ).toBe(404);
    const range = await get(other, `/sessions?from=${today()}&to=${addDays(today(), 13)}`);
    expect((range.body.items as Session[]).some((s) => s.batchId === batchId)).toBe(false);
    const aHoliday = await send(owner, 'post', '/holidays', {
      name: 'A only',
      startDate: next(7, 20),
      endDate: next(7, 20),
    });
    expect((await send(other, 'delete', `/holidays/${aHoliday.body.holiday.id}`)).status).toBe(404);
    const theirs = await get(other, '/holidays');
    expect((theirs.body.items as { id: string }[]).map((h) => h.id)).not.toContain(
      aHoliday.body.holiday.id,
    );
  });
});
