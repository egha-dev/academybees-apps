import { randomBytes } from 'node:crypto';

import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  type TestInfo,
} from '@playwright/test';

import { ownClientIp } from './client-ip.js';
import { writeInAcademy } from './db.js';
import { hostUrl } from './hosts.js';
import { signInAt } from './session.js';

export const DEMO_COURSE = '01a10000-0000-7000-8000-00000000c001';
/** The seeded teacher profile of teacher@demo-a.test. */
export const DEMO_TEACHER = '01a10000-0000-7000-8000-00000000e002';

/** Academy-local (IST) date and minutes since midnight. */
export function istNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}
const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * No class can be made "later today" in the last minutes of the day in India: then the class is
 * made earlier today instead (see `classForDemoTeacher`), so no spec has to skip.
 */
const tooLateToday = () => istNow().minutes > 22 * 60 + 50;

export type Admin = { context: BrowserContext; page: Page; testInfo: TestInfo };

/** The admin of demo-a in a browser of their own (the "other device"). */
export async function adminSession(browser: Browser, testInfo: TestInfo): Promise<Admin> {
  const context = await browser.newContext();
  await ownClientIp(context);
  const page = await context.newPage();
  await signInAt(page, testInfo, 'demo-a', 'admin@demo-a.test');
  return { context, page, testInfo };
}

/** A JSON API call as the admin (CSRF and a fresh idempotency key). */
export async function adminCall(
  admin: Admin,
  method: 'post' | 'put' | 'get',
  path: string,
  data?: object,
) {
  const csrf = (await admin.context.cookies()).find((c) => c.name.endsWith('ab_csrf'))!.value;
  const url = hostUrl(admin.testInfo, 'demo-a', `/api/v1${path}`);
  const headers = { 'x-csrf-token': csrf, 'idempotency-key': crypto.randomUUID() };
  const res =
    method === 'get'
      ? await admin.page.request.get(url)
      : await admin.page.request[method](url, { headers, ...(data ? { data } : {}) });
  expect(res.ok(), `${method.toUpperCase()} ${path}: ${await res.text()}`).toBe(true);
  return res.json() as Promise<Record<string, unknown>>;
}

/**
 * Through the API: a batch the demo teacher teaches, `count` of demo-a's seeded students enrolled
 * in it, and a class later today — the test's own batch and class, so the seed's timetable and
 * the weekday don't matter. Students are reused, never created: demo-a is on a trial plan with a
 * student limit, and enrolments don't count towards it.
 */
export async function classForDemoTeacher(
  admin: Admin,
  name: string,
  count: number,
  options: { earlier?: boolean } = {},
) {
  const batch = (await adminCall(admin, 'post', '/batches', {
    name,
    courseId: DEMO_COURSE,
    teacherIds: [DEMO_TEACHER],
  })) as { id: string };
  const page = (await adminCall(admin, 'get', '/students?status=ACTIVE&limit=100')) as {
    items: { id: string; fullName: string }[];
  };
  expect(page.items.length, 'seeded students in demo-a').toBeGreaterThanOrEqual(count);
  const students = page.items.slice(0, count).map((x) => ({ id: x.id, name: x.fullName }));
  for (const s of students)
    await adminCall(admin, 'post', `/batches/${batch.id}/enrolments`, { studentId: s.id });
  const now = istNow();
  if (options.earlier || tooLateToday()) {
    // Near midnight: a class at 00:00–00:30 today (the API refuses past times on purpose). A
    // teacher can still mark it for 48 hours, and the device keeps today's classes.
    const sessionId = uuidv7();
    await writeInAcademy(
      'demo-a',
      `INSERT INTO class_session (id, tenant_id, branch_id, batch_id, session_date, starts_at, ends_at,
         origin, updated_at)
       SELECT $2, $1, b.branch_id, b.id, $4::date, $4::date AT TIME ZONE 'Asia/Kolkata',
              ($4::date + time '00:30') AT TIME ZONE 'Asia/Kolkata', 'MANUAL', now()
         FROM batch b WHERE b.id = $3`,
      [sessionId, batch.id, now.date],
    );
    return { batchId: batch.id, sessionId, students };
  }
  const start = now.minutes + 30;
  const made = (await adminCall(admin, 'post', '/sessions', {
    batchId: batch.id,
    date: now.date,
    start: hhmm(start),
    end: hhmm(start + 30),
  })) as { session: { id: string } };
  return { batchId: batch.id, sessionId: made.session.id, students };
}

/** The academy's view of a class's roll call. */
export async function rollCall(admin: Admin, sessionId: string) {
  return (await adminCall(admin, 'get', `/sessions/${sessionId}/attendance`)) as {
    counts: Record<string, number>;
    students: { studentId: string; attendance: { status: string } | null }[];
  };
}

/** A UUIDv7, as the API expects for ids (rows inserted directly by a test). */
export function uuidv7(): string {
  const ts = Date.now().toString(16).padStart(12, '0');
  const r = randomBytes(10).toString('hex');
  const variant = ((parseInt(r[3]!, 16) & 0x3) | 0x8).toString(16);
  return `${ts.slice(0, 8)}-${ts.slice(8, 12)}-7${r.slice(0, 3)}-${variant}${r.slice(4, 7)}-${r.slice(7, 19)}`;
}
