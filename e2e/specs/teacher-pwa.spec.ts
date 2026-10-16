import { type APIRequestContext, expect, type Page, test, type TestInfo } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';
import { ownClientIp } from '../support/client-ip.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';
import { signInAt } from '../support/session.js';

/**
 * Teacher PWA, online (Phase 6 S4; UX §12, §14; C-124, C-126): the teacher's classes come from
 * this device's copy; Take attendance → Mark all present → one exception → Save → synced once.
 * Each run makes its own batch, students and a class later today, so the seed and the day of
 * the week don't matter.
 */
test.beforeAll(requireSeededAcademies);
test.beforeEach(({ context }) => ownClientIp(context));

const COURSE = '01a10000-0000-7000-8000-00000000c001';
const DEMO_TEACHER = '01a10000-0000-7000-8000-00000000e002';

/** Academy-local (IST) date and minutes since midnight. */
function istNow() {
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

/** As the admin, through the API: a batch the demo teacher teaches, 3 students, a class today. */
async function setUp(request: APIRequestContext, page: Page, testInfo: TestInfo, tag: string) {
  const csrf = (await page.context().cookies()).find((c) => c.name.endsWith('ab_csrf'))!.value;
  const call = async (path: string, data: object) => {
    const res = await request.post(hostUrl(testInfo, 'demo-a', `/api/v1${path}`), {
      headers: { 'x-csrf-token': csrf, 'idempotency-key': crypto.randomUUID() },
      data,
    });
    expect(res.status(), await res.text()).toBe(201);
    return (await res.json()) as { id: string; session?: { id: string } };
  };
  const batch = await call('/batches', {
    name: `Kathak ${tag}`,
    courseId: COURSE,
    teacherIds: [DEMO_TEACHER],
  });
  const names = ['Ira', 'Jai', 'Kavi'].map((n) => `${n} ${tag}`);
  for (const fullName of names) {
    const student = await call('/students', { fullName });
    await call(`/batches/${batch.id}/enrolments`, { studentId: student.id });
  }
  const now = istNow();
  const start = Math.min(now.minutes + 30, 23 * 60);
  const made = await call('/sessions', {
    batchId: batch.id,
    date: now.date,
    start: hhmm(start),
    end: hhmm(Math.min(start + 30, 23 * 60 + 59)),
  });
  return { batchId: batch.id, sessionId: made.session!.id, names };
}

test('the teacher takes attendance on the Teacher PWA; it reaches the academy once', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  test.skip(istNow().minutes > 22 * 60 + 50, 'Too close to midnight in India for a class today');
  const tag = `${testInfo.project.name.split('-')[0]} ${Date.now().toString(36)}`;

  // The admin prepares the class in their own browser.
  const adminContext = await browser.newContext();
  await ownClientIp(adminContext);
  const admin = await adminContext.newPage();
  await signInAt(admin, testInfo, 'demo-a', 'admin@demo-a.test');
  const { sessionId, names } = await setUp(admin.request, admin, testInfo, tag);

  // The teacher: Today shows the class from this device's copy.
  await signInAt(page, testInfo, 'demo-a', 'teacher@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/teach'));
  await expect(page.getByRole('heading', { level: 1, name: /^Hello, / })).toBeVisible({
    timeout: 30_000,
  });
  const classLink = page.getByRole('link', { name: new RegExp(`Kathak ${tag}`) });
  await expect(classLink.first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('All changes synced')).toBeVisible({ timeout: 30_000 });
  await expectNoA11yViolations(page);

  // Take attendance: Mark all present, then one absent, then save.
  await page.goto(hostUrl(testInfo, 'demo-a', `/teach/attendance?session=${sessionId}`));
  await expect(page.getByRole('heading', { level: 1, name: `Kathak ${tag}` })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByText(/0 present · 0 absent · 0 late · 0 leave · 3 not marked/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Mark all present' }).click();
  await page
    .getByRole('group', { name: `Attendance for ${names[1]}` })
    .getByRole('button', { name: 'Absent' })
    .click();
  await expect(
    page.getByText(/2 present · 1 absent · 0 late · 0 leave · 0 not marked/),
  ).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Save attendance' }).click();
  await expect(page.getByText('Saved on this device. It syncs automatically.')).toBeVisible();
  await expect(page.getByText('All changes synced')).toBeVisible({ timeout: 30_000 });

  // The academy has it once: 2 present, 1 absent.
  const roll = await admin.request.get(
    hostUrl(testInfo, 'demo-a', `/api/v1/sessions/${sessionId}/attendance`),
  );
  expect(roll.status()).toBe(200);
  expect((await roll.json()).counts).toMatchObject({ PRESENT: 2, ABSENT: 1, unmarked: 0 });

  // The other screens open; Sync shows nothing waiting.
  await page.goto(hostUrl(testInfo, 'demo-a', '/teach/sync'));
  await expect(page.getByRole('heading', { level: 1, name: 'Sync' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('Nothing waiting. All changes synced.').first()).toBeVisible();
  await page.goto(hostUrl(testInfo, 'demo-a', '/teach/students'));
  await expect(page.getByRole('button', { name: new RegExp(names[0]!) })).toBeVisible({
    timeout: 30_000,
  });
  await page.goto(hostUrl(testInfo, 'demo-a', '/teach/classes'));
  await expect(page.getByRole('heading', { level: 1, name: 'Classes' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('link', { name: new RegExp(`Kathak ${tag}.*Taken`) })).toBeVisible();
  await adminContext.close();
});
