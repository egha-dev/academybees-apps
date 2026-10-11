import {
  addDays,
  type Batch,
  type Enrolment,
  localDate,
  newId,
  ROLE_TEMPLATES,
  type RoleKey,
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
 * Courses, batches and enrolments (Phase 5 S2; PRD v3 §9, G-27; C-120…C-122): scope per role,
 * per-day capacity with student day plans, changing days and transfers that keep history.
 */
const urls = inject('databaseUrls');

type Session = { host: string; cookie: string; csrf: string };
const templateGrants = (key: RoleKey): Grant[] =>
  Object.entries(ROLE_TEMPLATES[key].grants).map(([capability, scope]) => ({ capability, scope }));
const today = () => localDate(new Date(), 'Asia/Kolkata');

describe('courses, batches and enrolments', () => {
  let app: INestApplication;
  let su: pg.Client;
  let a: TenantFixture;
  let b: TenantFixture;
  let owner: Session;
  let teacher: MemberFixture;
  let accountant: MemberFixture;
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
  const send = (s: Session, method: 'post' | 'patch' | 'put', path: string, body: unknown = {}) =>
    http()
      [method](`/api/v1${path}`)
      .set('Host', s.host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(body as object);

  /** Weekly slots straight in the table (the pattern API is S3). */
  async function meets(batchId: string, weekdays: number[]) {
    for (const weekday of weekdays)
      await su.query(
        `INSERT INTO schedule_rule (id, tenant_id, batch_id, weekday, start_minute, end_minute, effective_from, updated_at)
         VALUES ($1, $2, $3, $4, 1020, 1080, CURRENT_DATE - 30, now())`,
        [newId(), a.id, batchId, weekday],
      );
  }
  async function student(name: string): Promise<string> {
    const res = await send(owner, 'post', '/students', { fullName: name });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.id as string;
  }
  async function batch(name: string, body: Record<string, unknown> = {}): Promise<Batch> {
    const res = await send(owner, 'post', '/batches', {
      name,
      courseId: a.people.courseId,
      ...body,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as Batch;
  }

  beforeAll(async () => {
    app = await createTestApp();
    su = new pg.Client({ connectionString: urls.superuser });
    await su.connect();
    [a, b] = await Promise.all([
      createTenantFixture(urls.migrator, { name: 'Batches Academy', plan: 'pro' }),
      createTenantFixture(urls.migrator, { name: 'Other Batches Academy', plan: 'pro' }),
    ]);
    const member = (roleKey: RoleKey) =>
      addMemberFixture(urls.migrator, a.id, {
        email: `${roleKey}-${a.slug}@example.test`,
        roleKey,
        grants: templateGrants(roleKey),
      });
    [teacher, accountant] = await Promise.all([member('teacher'), member('accountant')]);
    // The teacher's own profile teaches only the fixture batch.
    const { rows } = await su.query<{ id: string }>(
      `INSERT INTO teacher (id, tenant_id, branch_id, membership_id, full_name, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Tara Teacher', now()) RETURNING id`,
      [a.id, a.branchId, teacher.membershipId],
    );
    await su.query(
      `INSERT INTO batch_teacher (tenant_id, batch_id, teacher_id, is_primary) VALUES ($1, $2, $3, false)`,
      [a.id, a.people.batchId, rows[0]!.id],
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
  });

  it('courses with levels; batches with teachers; a course with active batches can’t be archived', async () => {
    const course = await send(owner, 'post', '/courses', {
      name: 'Bharatanatyam',
      levels: ['Beginner', 'Intermediate'],
    });
    expect(course.status, JSON.stringify(course.body)).toBe(201);
    expect((course.body.levels as { name: string }[]).map((l) => l.name)).toEqual([
      'Beginner',
      'Intermediate',
    ]);
    const created = await send(owner, 'post', '/batches', {
      name: 'Evening Beginners',
      courseId: course.body.id,
      levelId: course.body.levels[0].id,
      capacity: 12,
      teacherIds: [a.people.teacherId],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body).toMatchObject({
      courseName: 'Bharatanatyam',
      levelName: 'Beginner',
      capacity: 12,
      enrolled: 0,
      teachers: [{ teacherId: a.people.teacherId, isPrimary: true }],
    });
    const archive = await send(owner, 'patch', `/courses/${course.body.id}`, {
      version: course.body.version,
      status: 'ARCHIVED',
    });
    expect(archive.status).toBe(409);
    // Versioned edits.
    const edit = await send(owner, 'patch', `/batches/${created.body.id}`, {
      version: created.body.version,
      capacity: 15,
    });
    expect(edit.body.capacity).toBe(15);
    const stale = await send(owner, 'patch', `/batches/${created.body.id}`, {
      version: created.body.version,
      capacity: 20,
    });
    expect(stale.status).toBe(409);
    const activity = await get(owner, `/batches/${created.body.id}/activity`);
    expect((activity.body.items as { type: string }[]).map((i) => i.type)).toEqual(
      expect.arrayContaining(['batch.created', 'batch.updated']),
    );
  });

  it('a teacher sees only the batches they teach; the accountant reads all but changes nothing', async () => {
    const other = await batch('Not Tara’s batch');
    const t = await signIn(a, teacher.email);
    const mine = await get(t, '/batches');
    expect((mine.body.items as { id: string }[]).map((i) => i.id)).toEqual([a.people.batchId]);
    expect((await get(t, `/batches/${other.id}`)).status).toBe(404);
    expect((await get(t, `/batches/${a.people.batchId}/students`)).status).toBe(200);
    expect(
      (await send(t, 'post', '/batches', { name: 'x', courseId: a.people.courseId })).status,
    ).toBe(403);
    const acc = await signIn(a, accountant.email);
    expect((await get(acc, `/batches/${other.id}`)).status).toBe(200);
    expect(
      (
        await send(acc, 'post', `/batches/${other.id}/enrolments`, {
          studentId: a.people.studentId,
        })
      ).status,
    ).toBe(403);
  });

  it('day plans: who comes which day, per-day capacity, days outside the schedule refused', async () => {
    const dance = await batch('Mon/Tue/Thu dance', { capacity: 1 });
    await meets(dance.id, [1, 2, 4]);
    const [asha, ravi] = [await student('Asha Kumar'), await student('Ravi Menon')];
    // Asha comes every day the batch meets.
    const first = await send(owner, 'post', `/batches/${dance.id}/enrolments`, { studentId: asha });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body).toMatchObject({ weekdays: [], classesPerWeek: 3 });
    // Ravi only Tue/Thu: Tue and Thu would be 2/1.
    const over = await send(owner, 'post', `/batches/${dance.id}/enrolments`, {
      studentId: ravi,
      weekdays: [4, 2],
    });
    expect(over.status).toBe(409);
    expect(over.body.error.details).toEqual([
      { path: 'weekday.2', issue: 'over_capacity' },
      { path: 'weekday.4', issue: 'over_capacity' },
    ]);
    const outside = await send(owner, 'post', `/batches/${dance.id}/enrolments`, {
      studentId: ravi,
      weekdays: [6],
      confirmOverCapacity: true,
    });
    expect(outside.status).toBe(400);
    expect(outside.body.error.details).toEqual([{ path: 'weekday.6', issue: 'not_in_schedule' }]);
    const ok = await send(owner, 'post', `/batches/${dance.id}/enrolments`, {
      studentId: ravi,
      weekdays: [4, 2],
      confirmOverCapacity: true,
    });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ weekdays: [2, 4], classesPerWeek: 2 });
    const detail = (await get(owner, `/batches/${dance.id}`)).body as Batch;
    expect(detail.weekdays).toEqual([1, 2, 4]);
    expect(detail.dayLoad).toEqual([
      { weekday: 1, students: 1 },
      { weekday: 2, students: 2 },
      { weekday: 4, students: 2 },
    ]);
    expect(detail.enrolled).toBe(2);
    expect(detail.fullestDay).toMatchObject({ students: 2 });
    // Already in the batch.
    expect(
      (await send(owner, 'post', `/batches/${dance.id}/enrolments`, { studentId: asha })).status,
    ).toBe(409);
  });

  it('changing days from a date and transferring keep history; past rosters stay true', async () => {
    const morning = await batch('Morning');
    const evening = await batch('Evening');
    await meets(morning.id, [1, 3, 5]);
    await meets(evening.id, [2, 4]);
    const kid = await student('Kiran Das');
    const start = addDays(today(), -20);
    const enrolled = await send(owner, 'post', `/batches/${morning.id}/enrolments`, {
      studentId: kid,
      startedOn: start,
    });
    expect(enrolled.status).toBe(201);
    // From 10 days ago, only Mondays and Fridays.
    const from = addDays(today(), -10);
    const changed = await send(owner, 'post', `/enrolments/${enrolled.body.id}/days`, {
      from,
      weekdays: [1, 5],
    });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(changed.body).toMatchObject({ startedOn: from, weekdays: [1, 5], classesPerWeek: 2 });
    const before = await get(owner, `/batches/${morning.id}/students?on=${addDays(from, -1)}`);
    expect(before.body.items).toEqual([
      expect.objectContaining({ studentId: kid, weekdays: [], endedOn: addDays(from, -1) }),
    ]);
    // Transfer to the evening batch from tomorrow.
    const tomorrow = addDays(today(), 1);
    const moved = await send(owner, 'post', `/students/${kid}/transfer`, {
      fromBatchId: morning.id,
      toBatchId: evening.id,
      date: tomorrow,
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(moved.body).toMatchObject({
      batchId: evening.id,
      startedOn: tomorrow,
      classesPerWeek: 2,
    });
    // Today they are still in the morning batch; tomorrow only in the evening one.
    const todayMorning = await get(owner, `/batches/${morning.id}/students?on=${today()}`);
    expect((todayMorning.body.items as Enrolment[]).map((e) => e.studentId)).toContain(kid);
    const tomorrowMorning = await get(owner, `/batches/${morning.id}/students?on=${tomorrow}`);
    expect((tomorrowMorning.body.items as Enrolment[]).map((e) => e.studentId)).not.toContain(kid);
    const rows = await su.query(
      `SELECT count(*)::int AS n FROM batch_enrolment WHERE student_id = $1`,
      [kid],
    );
    expect(rows.rows[0].n).toBe(3); // nothing deleted
    const timeline = await get(owner, `/students/${kid}/activity`);
    expect((timeline.body.items as { type: string }[]).map((i) => i.type)).toEqual(
      expect.arrayContaining([
        'enrolment.started',
        'enrolment.days_changed',
        'student.transferred',
      ]),
    );
  });

  it('leaving: end one enrolment, or end all with the status change (G-27)', async () => {
    const one = await batch('Leaving A');
    const two = await batch('Leaving B');
    const kid = await student('Meena Iyer');
    const e1 = await send(owner, 'post', `/batches/${one.id}/enrolments`, { studentId: kid });
    await send(owner, 'post', `/batches/${two.id}/enrolments`, { studentId: kid });
    const ended = await send(owner, 'post', `/enrolments/${e1.body.id}/end`, { endedOn: today() });
    expect(ended.body.endedOn).toBe(today());
    const s = (await get(owner, `/students/${kid}`)).body as { version: number };
    const left = await send(owner, 'post', `/students/${kid}/status`, {
      version: s.version,
      status: 'LEFT',
      reason: 'Moved city',
      endEnrolmentsOn: today(),
    });
    expect(left.status, JSON.stringify(left.body)).toBe(200);
    const open = await su.query(
      `SELECT count(*)::int AS n FROM batch_enrolment WHERE student_id = $1 AND ended_on IS NULL`,
      [kid],
    );
    expect(open.rows[0].n).toBe(0);
  });

  it('another academy’s courses, batches and enrolments are 404', async () => {
    const other = await signIn(b, b.user.email);
    const ids = {
      course: a.people.courseId,
      batch: a.people.batchId,
      enrolment: a.people.enrolmentId,
    };
    expect((await get(other, `/courses/${ids.course}`)).status).toBe(404);
    expect(
      (await send(other, 'patch', `/courses/${ids.course}`, { version: 1, name: 'x' })).status,
    ).toBe(404);
    expect((await get(other, `/batches/${ids.batch}`)).status).toBe(404);
    expect(
      (await send(other, 'patch', `/batches/${ids.batch}`, { version: 1, capacity: 3 })).status,
    ).toBe(404);
    expect((await get(other, `/batches/${ids.batch}/students`)).status).toBe(404);
    expect(
      (
        await send(other, 'post', `/batches/${ids.batch}/enrolments`, {
          studentId: b.people.studentId,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await send(other, 'post', `/enrolments/${ids.enrolment}/days`, {
          from: today(),
          weekdays: [1],
        })
      ).status,
    ).toBe(404);
    expect(
      (await send(other, 'post', `/enrolments/${ids.enrolment}/end`, { endedOn: today() })).status,
    ).toBe(404);
    expect(
      (
        await send(other, 'post', `/students/${a.people.studentId}/transfer`, {
          fromBatchId: ids.batch,
          toBatchId: b.people.batchId,
          date: addDays(today(), 1),
        })
      ).status,
    ).toBe(404);
    // B's own batch with A's student: the student is not found in B.
    expect(
      (
        await send(other, 'post', `/batches/${b.people.batchId}/enrolments`, {
          studentId: a.people.studentId,
        })
      ).status,
    ).toBe(404);
  });
});
