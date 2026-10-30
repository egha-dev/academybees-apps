import {
  addDays,
  isoWeekday,
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
import type { Job } from 'bullmq';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { AttendanceNudgeProcessor } from '../../src/modules/notifications/nudge.processor.js';
import type { AttendanceNudgeJob } from '../../src/modules/notifications/nudge.queue.js';
import { createTestApp } from '../support/test-app.js';

/**
 * Notifications and teacher nudges (Phase 6 S7; C-04, G-16), plus the Phase 5 review lows fixed
 * here (C-123: L1 teacher-set version, L3 holiday confirm = preview, L4 class changes in activity,
 * L5 same-day day-plan check).
 */
const urls = inject('databaseUrls');

type Session = { host: string; cookie: string; csrf: string };
const templateGrants = (key: RoleKey): Grant[] =>
  Object.entries(ROLE_TEMPLATES[key].grants).map(([capability, scope]) => ({ capability, scope }));
const today = () => localDate(new Date(), 'Asia/Kolkata');

describe('notifications and nudges', () => {
  let app: INestApplication;
  let su: pg.Client;
  let a: TenantFixture;
  let b: TenantFixture;
  let owner: Session;
  let teacher: Session;
  let teacherMember: MemberFixture;
  let batchId: string;
  let studentId: string;
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
  /** A one-off class that started and ended `minutesAgo` minutes ago (ended → +30 min long). */
  async function classEnded(minutesAgo: number) {
    const id = newId();
    await su.query(
      `INSERT INTO class_session (id, tenant_id, branch_id, batch_id, session_date, starts_at, ends_at,
         origin, updated_at)
       VALUES ($1, $2, $3, $4, (now() AT TIME ZONE 'Asia/Kolkata')::date,
               now() - make_interval(mins => $5 + 30), now() - make_interval(mins => $5), 'MANUAL', now())`,
      [id, a.id, a.branchId, batchId, minutesAgo],
    );
    return id;
  }
  const nudge = () =>
    app
      .get(AttendanceNudgeProcessor)
      .process({ data: { tenantId: a.id } } as Job<AttendanceNudgeJob>);
  const mine = async (s: Session) =>
    (await get(s, '/notifications')).body.items as { kind: string; link: string; params: object }[];

  beforeAll(async () => {
    app = await createTestApp();
    su = new pg.Client({ connectionString: urls.superuser });
    await su.connect();
    [a, b] = await Promise.all([
      createTenantFixture(urls.migrator, { name: 'Nudge Academy', plan: 'pro' }),
      createTenantFixture(urls.migrator, { name: 'Other Nudge Academy', plan: 'pro' }),
    ]);
    teacherMember = await addMemberFixture(urls.migrator, a.id, {
      email: `teacher-${a.slug}@example.test`,
      roleKey: 'teacher',
      grants: templateGrants('teacher'),
    });
    owner = await signIn(a, a.user.email);
    const made = await send(owner, 'post', '/batches', {
      name: 'Nudged batch',
      courseId: a.people.courseId,
    });
    batchId = made.body.id as string;
    const { rows } = await su.query<{ id: string }>(
      `INSERT INTO teacher (id, tenant_id, branch_id, membership_id, full_name, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Nudged Teacher', now()) RETURNING id`,
      [a.id, a.branchId, teacherMember.membershipId],
    );
    await su.query(
      `INSERT INTO batch_teacher (tenant_id, batch_id, teacher_id, is_primary) VALUES ($1, $2, $3, true)`,
      [a.id, batchId, rows[0]!.id],
    );
    studentId = a.people.studentId;
    await su.query(
      `INSERT INTO batch_enrolment (id, tenant_id, batch_id, student_id, started_on, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_DATE - 30, now())`,
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
    teacher = await signIn(a, `teacher-${a.slug}@example.test`);
  });

  it('nudges the teacher once, 30 minutes after a class without a roll call (G-16)', async () => {
    const due = await classEnded(45);
    const tooSoon = await classEnded(10);
    const taken = await classEnded(50);
    await send(owner, 'put', `/sessions/${taken}/attendance`, {
      marks: [{ studentId, status: 'PRESENT' }],
    });
    const cancelled = await classEnded(55);
    await su.query(
      `UPDATE class_session SET status = 'CANCELLED', cancel_reason = 'OTHER', cancelled_at = now() WHERE id = $1`,
      [cancelled],
    );
    expect(await nudge()).toBe(1);
    expect(await nudge()).toBe(0); // once per class
    const items = await mine(teacher);
    expect(items).toEqual([
      expect.objectContaining({
        kind: 'ATTENDANCE_NOT_TAKEN',
        link: `/teach/attendance?session=${due}`,
        params: expect.objectContaining({ batch: 'Nudged batch' }),
      }),
    ]);
    expect(items.some((i) => i.link.endsWith(tooSoon))).toBe(false);
    // Only the teacher gets it (every member's list is their own; fixtures add a read one).
    expect((await mine(owner)).some((i) => i.link?.endsWith(due))).toBe(false);
  });

  it('unread count, mark read; another academy never sees them', async () => {
    expect((await get(teacher, '/notifications/unread')).body.count).toBeGreaterThanOrEqual(1);
    const read = await send(teacher, 'post', '/notifications/read', { all: true });
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    expect((await get(teacher, '/notifications/unread')).body.count).toBe(0);
    const { rows: events } = await su.query<{ properties: { count: number; all: boolean } }>(
      `SELECT payload->'properties' AS properties FROM outbox_event
        WHERE type = 'analytics.event' AND tenant_id = $1
          AND payload->>'name' = 'notification.read'`,
      [a.id],
    );
    expect(events.map((e) => e.properties.all)).toEqual([true]);
    expect((await send(teacher, 'post', '/notifications/read', {})).status).toBe(400);
    const other = await signIn(b, b.user.email);
    const theirs = (await get(other, '/notifications')).body.items as { link: string | null }[];
    expect(theirs.some((i) => i.link?.startsWith('/teach/attendance'))).toBe(false);
  });

  it('L1: changing a batch’s teachers from a stale version is a conflict', async () => {
    const current = await get(owner, `/batches/${batchId}`);
    const stale = current.body.version as number;
    const first = await send(owner, 'put', `/batches/${batchId}/teachers`, {
      version: stale,
      teachers: [{ teacherId: a.people.teacherId, isPrimary: true }],
    });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    const second = await send(owner, 'put', `/batches/${batchId}/teachers`, {
      version: stale,
      teachers: [],
    });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('L3: confirming a holiday cancels exactly the previewed classes, or says they changed', async () => {
    const day = addDays(today(), 20);
    const input = { name: 'Preview day', startDate: day, endDate: day };
    const preview = await send(owner, 'post', '/holidays/preview', input);
    const ids = (preview.body.days as { sessions: { id: string }[] }[]).flatMap((d) =>
      d.sessions.map((x) => x.id),
    );
    // A class appears on that day after the preview.
    await send(owner, 'post', '/sessions', {
      batchId,
      date: day,
      start: '20:00',
      end: '21:00',
    });
    const changed = await send(owner, 'post', '/holidays', { ...input, previewedSessionIds: ids });
    expect(changed.status).toBe(409);
    expect(changed.body.error.details).toEqual([
      { path: 'previewedSessionIds', issue: 'preview_changed' },
    ]);
    const fresh = await send(owner, 'post', '/holidays/preview', input);
    const now = (fresh.body.days as { sessions: { id: string }[] }[]).flatMap((d) =>
      d.sessions.map((x) => x.id),
    );
    const ok = await send(owner, 'post', '/holidays', { ...input, previewedSessionIds: now });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.cancelled).toBe(now.length);
  });

  it('L4: cancelling or adding a class shows in the batch’s activity', async () => {
    const day = addDays(today(), 3);
    const extra = await send(owner, 'post', '/sessions', {
      batchId,
      date: day,
      start: '19:00',
      end: '19:30',
    });
    expect(extra.status, JSON.stringify(extra.body)).toBe(201);
    const s = extra.body.session as { id: string; version: number };
    await send(owner, 'post', `/sessions/${s.id}/cancel`, { version: s.version, reason: 'OTHER' });
    const activity = await get(owner, `/batches/${batchId}/activity?limit=20`);
    const changes = (activity.body.items as { type: string; data: { change?: string } }[])
      .filter((e) => e.type === 'batch.class_changed')
      .map((e) => e.data.change);
    expect(changes).toEqual(expect.arrayContaining(['extra', 'cancelled']));
  });

  it('L5: correcting a day plan on the day it began still checks the batch’s days', async () => {
    // The batch meets only on Mondays from today.
    await send(owner, 'put', `/batches/${batchId}/schedule`, {
      slots: [{ weekday: 1, start: '18:00', end: '19:00' }],
    });
    const other = await send(owner, 'post', '/students', { fullName: 'Plan Changer' });
    const enrolled = await send(owner, 'post', `/batches/${batchId}/enrolments`, {
      studentId: other.body.id,
    });
    expect(enrolled.status, JSON.stringify(enrolled.body)).toBe(201);
    const notMonday = isoWeekday(today()) === 3 ? 4 : 3;
    const res = await send(owner, 'post', `/enrolments/${enrolled.body.id}/days`, {
      from: enrolled.body.startedOn,
      weekdays: [notMonday],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { path: `weekday.${notMonday}`, issue: 'not_in_schedule' },
    ]);
  });
});
