import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  type TestInfo,
} from '@playwright/test';

import { ownClientIp } from './client-ip.js';
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

/** No class can be made "later today" in the last minutes of the day in India. */
export const tooLateToday = () => istNow().minutes > 22 * 60 + 50;

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
 * Through the API: a batch the demo teacher teaches, `count` enrolled students, and a class later
 * today — the test's own data, so the seed and the weekday don't matter.
 */
export async function classForDemoTeacher(admin: Admin, name: string, count: number) {
  const batch = (await adminCall(admin, 'post', '/batches', {
    name,
    courseId: DEMO_COURSE,
    teacherIds: [DEMO_TEACHER],
  })) as { id: string };
  const students: { id: string; name: string }[] = [];
  for (let i = 0; i < count; i++) {
    const fullName = `Pupil ${String(i + 1).padStart(2, '0')} ${name.split(' ').slice(1).join(' ')}`;
    const student = (await adminCall(admin, 'post', '/students', { fullName })) as { id: string };
    await adminCall(admin, 'post', `/batches/${batch.id}/enrolments`, { studentId: student.id });
    students.push({ id: student.id, name: fullName });
  }
  const now = istNow();
  const start = Math.min(now.minutes + 30, 23 * 60);
  const made = (await adminCall(admin, 'post', '/sessions', {
    batchId: batch.id,
    date: now.date,
    start: hhmm(start),
    end: hhmm(Math.min(start + 30, 23 * 60 + 59)),
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
