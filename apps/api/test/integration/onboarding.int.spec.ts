import { LEGAL_DOCUMENTS, ROLE_TEMPLATES } from '@academybee/contracts';
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
import type { OnboardingState } from '@academybee/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createTestApp } from '../support/test-app.js';

/**
 * Guided setup (UX v1.1 §5, C-08, C-85, C-87, C-92): legal first, per-step saves with optimistic
 * concurrency, resume anywhere, editing instead of duplicating, the student limit, sessions in the
 * academy's timezone, and finishing opens the academy.
 */
const urls = inject('databaseUrls');

type Session = { host: string; cookie: string; csrf: string };

describe('onboarding', () => {
  let app: INestApplication;
  let su: pg.Client;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
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

  async function signIn(t: TenantFixture, email = t.user.email): Promise<Session> {
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
  const acceptLegal = (s: Session) =>
    http()
      .post('/api/v1/legal/accept')
      .set('Host', s.host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .send({ documentIds: LEGAL_DOCUMENTS.map((d) => d.id) });
  const state = (s: Session) =>
    http().get('/api/v1/onboarding').set('Host', s.host).set('Cookie', s.cookie);
  const put = (s: Session, step: string, body: Record<string, unknown>) =>
    http()
      .put(`/api/v1/onboarding/steps/${step}`)
      .set('Host', s.host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(body);
  const complete = (s: Session) =>
    http()
      .post('/api/v1/onboarding/complete')
      .set('Host', s.host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({});
  /** Save a step with the current version; returns the new state. */
  async function save(s: Session, step: string, data?: unknown, action: 'save' | 'skip' = 'save') {
    const version = ((await state(s)).body as { version: number }).version;
    const res = await put(s, step, { action, version, ...(data !== undefined ? { data } : {}) });
    expect(res.status, `${step}: ${JSON.stringify(res.body)}`).toBe(200);
    return res.body as OnboardingState;
  }
  async function setupAcademy() {
    const t = await createTenantFixture(urls.migrator, { status: 'SETUP' });
    const s = await signIn(t);
    expect((await acceptLegal(s)).status).toBe(200);
    return { t, s };
  }

  it('needs the legal documents accepted first', async () => {
    const t = await createTenantFixture(urls.migrator, { status: 'SETUP' });
    const s = await signIn(t);
    const res = await state(s);
    expect(res.status).toBe(403);
    expect(res.body.error.details).toEqual([{ path: 'legal', issue: 'acceptance_required' }]);
    await acceptLegal(s);
    expect((await state(s)).status).toBe(200);
  });

  it('the whole setup: every step, then the academy opens', async () => {
    const { t, s } = await setupAcademy();
    const start = (await state(s)).body;
    expect(start).toMatchObject({ currentStep: 'profile', completed: false, canComplete: false });

    let st = await save(s, 'profile', {
      name: 'Gurushethra',
      phone: '98400 12345',
      email: 'hello@gurushethra.test',
      timezone: 'Asia/Kolkata',
    });
    expect(st.currentStep).toBe('type');
    expect(st.values.profile).toMatchObject({ name: 'Gurushethra', phone: '+919840012345' });
    st = await save(s, 'type', { academyType: 'dance' });
    expect(st.terminology).toEqual({ batch: 'class', course: 'course', teacher: 'teacher' });
    expect(st.canComplete).toBe(true);
    st = await save(s, 'course', { name: 'Bharatanatyam' });
    st = await save(s, 'teacher', { mode: 'self' });
    expect(st.values.teacher).toMatchObject({ mode: 'self', invitationPending: false });
    st = await save(s, 'batch', { name: 'Evening juniors', capacity: 15 });
    st = await save(s, 'students', {
      students: [
        { fullName: 'Ananya', parentName: 'Meera', parentPhone: '9840012345' },
        { fullName: 'ஆரவ்' },
      ],
    });
    expect(st.values.students.map((x) => x.fullName)).toEqual(['Ananya', 'ஆரவ்']);
    // The fixture already used ADM-0001.
    expect(st.values.students.map((x) => x.admissionNo)).toEqual(['ADM-0002', 'ADM-0003']);
    st = await save(s, 'timetable', {
      slots: [
        { weekday: 1, start: '17:00', end: '18:00' },
        { weekday: 4, start: '17:00', end: '18:00' },
      ],
    });
    expect(st.currentStep).toBe('ready');
    expect(st.values.timetable.slots).toHaveLength(2);
    expect(st.values.timetable.sessionCount).toBeGreaterThanOrEqual(3);
    expect(st.values.timetable.upcoming[0]).toMatchObject({ start: '17:00', end: '18:00' });

    // Sessions: academy-local 17:00 = 11:30 UTC; students enrolled; owner teaches.
    const sessions = await su.query(
      `SELECT to_char(starts_at AT TIME ZONE 'UTC', 'HH24:MI') AS utc, teacher_id FROM class_session
        WHERE tenant_id=$1 AND schedule_rule_id IS NOT NULL AND batch_id <> $2`,
      [t.id, t.people.batchId],
    );
    expect(new Set(sessions.rows.map((r: { utc: string }) => r.utc))).toEqual(new Set(['11:30']));
    const enrolled = await su.query(
      `SELECT count(*)::int n FROM batch_enrolment e JOIN batch b ON b.id=e.batch_id
        WHERE e.tenant_id=$1 AND b.name='Evening juniors' AND e.ended_on IS NULL`,
      [t.id],
    );
    expect(enrolled.rows[0].n).toBe(2);

    const done = await complete(s);
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ completed: true, currentStep: 'ready' });
    const tenant = await su.query(`SELECT status, name, timezone FROM tenant WHERE id=$1`, [t.id]);
    expect(tenant.rows[0]).toMatchObject({ status: 'ACTIVE', name: 'Gurushethra' });
    const ctx = await http().get('/api/v1/tenant/context').set('Host', s.host);
    expect(ctx.body).toMatchObject({ status: 'ACTIVE', displayName: 'Gurushethra' });
    const audit = await su.query(
      `SELECT count(*)::int n FROM audit_log WHERE tenant_id=$1 AND action='academy.onboarding_completed'`,
      [t.id],
    );
    expect(audit.rows[0].n).toBe(1);
    // Finished: steps can't be changed any more; completing again is harmless.
    expect(
      (await put(s, 'course', { action: 'save', version: done.body.version, data: { name: 'X' } }))
        .status,
    ).toBe(409);
    expect((await complete(s)).status).toBe(200);
  });

  it('resumes where the owner left off, on another device', async () => {
    const { t, s } = await setupAcademy();
    await save(s, 'profile', { name: 'Resume Academy' });
    await save(s, 'type', { academyType: 'music' });
    await save(s, 'course', { name: 'Carnatic vocal' });
    // A new sign-in is a new device/session.
    const other = await signIn(t);
    const st = (await state(other)).body;
    expect(st.currentStep).toBe('teacher');
    expect(st.values.course).toEqual({ name: 'Carnatic vocal', description: null });
    expect(st.steps.course.status).toBe('done');
  });

  it('two devices: a stale version is refused instead of overwriting', async () => {
    const { s } = await setupAcademy();
    const version = ((await state(s)).body as { version: number }).version;
    expect(
      (await put(s, 'profile', { action: 'save', version, data: { name: 'First' } })).status,
    ).toBe(200);
    const stale = await put(s, 'profile', { action: 'save', version, data: { name: 'Second' } });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('Profile and Type cannot be skipped; others can, and later steps say what they need', async () => {
    const { s } = await setupAcademy();
    const version = ((await state(s)).body as { version: number }).version;
    const skip = await put(s, 'profile', { action: 'skip', version });
    expect(skip.status).toBe(400);
    expect(skip.body.error.details).toEqual([{ path: 'step', issue: 'required' }]);
    await save(s, 'profile', { name: 'Skipper' });
    await save(s, 'type', { academyType: 'art' });
    await save(s, 'course', undefined, 'skip');
    const v = ((await state(s)).body as { version: number }).version;
    const batch = await put(s, 'batch', { action: 'save', version: v, data: { name: 'B1' } });
    expect(batch.status).toBe(400);
    expect(batch.body.error.details).toEqual([{ path: 'course', issue: 'required' }]);
    const bad = await put(s, 'timetable', {
      action: 'save',
      version: v,
      data: { slots: [{ weekday: 9, start: '25:00', end: '18:00' }] },
    });
    expect(bad.status).toBe(400);
    // Skipping the rest still lets the academy open.
    expect((await complete(s)).status).toBe(200);
  });

  it('going back edits what a step created instead of adding more', async () => {
    const { t, s } = await setupAcademy();
    await save(s, 'course', { name: 'Course v1' });
    await save(s, 'course', { name: 'Course v2' });
    await save(s, 'students', {
      students: [{ fullName: 'One' }, { fullName: 'Two', parentPhone: '9840000002' }],
    });
    const st = await save(s, 'students', { students: [{ fullName: 'One edited' }] });
    expect(st.values.students).toEqual([
      { fullName: 'One edited', admissionNo: 'ADM-0002', parentName: null, parentPhone: null },
    ]);
    const rows = await su.query(
      `SELECT full_name, status FROM student WHERE tenant_id=$1 AND admission_no IN ('ADM-0002','ADM-0003') ORDER BY admission_no`,
      [t.id],
    );
    expect(rows.rows).toEqual([
      { full_name: 'One edited', status: 'ACTIVE' },
      { full_name: 'Two', status: 'LEFT' },
    ]);
    const courses = await su.query(
      `SELECT name FROM course WHERE tenant_id=$1 AND name LIKE 'Course v%'`,
      [t.id],
    );
    expect(courses.rows).toEqual([{ name: 'Course v2' }]);
  });

  it('inviting a teacher, then choosing to teach yourself, cancels the invitation', async () => {
    const { t, s } = await setupAcademy();
    const st = await save(s, 'teacher', {
      mode: 'invite',
      name: 'Kavya Teacher',
      email: `kavya-${t.slug}@example.test`,
    });
    expect(st.values.teacher).toMatchObject({
      mode: 'invite',
      name: 'Kavya Teacher',
      invitationPending: true,
    });
    const inv = await su.query(
      `SELECT invitee_name, role_keys, revoked_at FROM invitation WHERE tenant_id=$1 AND email=$2`,
      [t.id, `kavya-${t.slug}@example.test`],
    );
    expect(inv.rows[0]).toMatchObject({
      invitee_name: 'Kavya Teacher',
      role_keys: ['teacher'],
      revoked_at: null,
    });
    await save(s, 'teacher', { mode: 'self' });
    const after = await su.query(
      `SELECT revoked_at FROM invitation WHERE tenant_id=$1 AND email=$2`,
      [t.id, `kavya-${t.slug}@example.test`],
    );
    expect(after.rows[0].revoked_at).not.toBeNull();
  });

  it("the plan's student limit applies (C-89)", async () => {
    const { t, s } = await setupAcademy();
    // The fixture has one student; allow two in total.
    await su.query(
      `INSERT INTO subscription_override (id, tenant_id, key, kind, "limit", reason)
       VALUES (gen_random_uuid(), $1, 'students', 'LIMIT', 2, 'test')`,
      [t.id],
    );
    const version = ((await state(s)).body as { version: number }).version;
    const res = await put(s, 'students', {
      action: 'save',
      version,
      data: { students: [{ fullName: 'A' }, { fullName: 'B' }] },
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({
      code: 'ENTITLEMENT_LIMIT_REACHED',
      details: [{ path: 'students', issue: 'limit_reached' }],
    });
    await save(s, 'students', { students: [{ fullName: 'A' }] });
  });

  it('only the owner runs the setup; another academy sees nothing of it', async () => {
    const { t, s } = await setupAcademy();
    await save(s, 'course', { name: 'Private course' });
    const teacher = await addMemberFixture(urls.migrator, t.id, {
      email: `teacher-${t.slug}@example.test`,
      roleKey: 'teacher',
      grants: Object.entries(ROLE_TEMPLATES.teacher.grants).map(([capability, scope]) => ({
        capability,
        scope,
      })),
    });
    const ts = await signIn(t, teacher.email);
    await acceptLegal(ts);
    expect((await state(ts)).status).toBe(403);

    // Another academy's owner, on their own host, only ever sees their own setup.
    const other = await setupAcademy();
    const theirs = (await state(other.s)).body;
    expect(theirs.values.course).toBeNull();
    // A's session on B's host is refused outright.
    const cross = await http()
      .get('/api/v1/onboarding')
      .set('Host', other.s.host)
      .set('Cookie', s.cookie);
    expect(cross.status).toBe(401);
    expect(cross.body.error.code).toBe('TENANT_MISMATCH');
  });
});
