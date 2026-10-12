import { expect, type Page, type TestInfo, test } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';
import { ownClientIp } from '../support/client-ip.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';
import { signInAt } from '../support/session.js';

/**
 * Timetable and holidays (UX §11.6; G-03, C-115, C-116): the week shows real classes; a class is
 * cancelled from its sheet and given a make-up; a holiday previews exactly what it cancels before
 * confirming, and removing it brings the classes back; phones get a timeline.
 */
test.beforeAll(requireSeededAcademies);
test.beforeEach(({ context }) => ownClientIp(context));

const COURSE = '01a10000-0000-7000-8000-00000000c001';
/** Academy-local (IST) calendar date `days` from now. */
const istDate = (days = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
    new Date(Date.now() + days * 86_400_000),
  );
const weekday = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** A batch of the test's own with one weekly class on `date`'s weekday (clean on every run). */
async function batchMeetingOn(page: Page, testInfo: TestInfo, name: string, date: string) {
  const csrf = (await page.context().cookies()).find((c) => c.name.endsWith('ab_csrf'))!.value;
  const headers = { 'x-csrf-token': csrf };
  const made = await page.request.post(hostUrl(testInfo, 'demo-a', '/api/v1/batches'), {
    headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
    data: { name, courseId: COURSE },
  });
  expect(made.status()).toBe(201);
  const { id } = (await made.json()) as { id: string };
  const saved = await page.request.put(
    hostUrl(testInfo, 'demo-a', `/api/v1/batches/${id}/schedule`),
    { headers, data: { slots: [{ weekday: weekday(date), start: '16:00', end: '17:00' }] } },
  );
  expect(saved.ok()).toBe(true);
  return id;
}

test('the week shows real classes; cancel one and add a make-up', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Changes demo-a; run once');
  test.setTimeout(150_000);
  const tag = Date.now().toString(36);
  await signInAt(page, testInfo, 'demo-a', 'admin@demo-a.test');
  const day = istDate(2);
  await batchMeetingOn(page, testInfo, `Tabla ${tag}`, day);

  await page.goto(hostUrl(testInfo, 'demo-a', '/timetable'));
  await expect(page.getByRole('heading', { level: 1, name: 'Timetable' })).toBeVisible();
  // The seeded Mon–Fri batch meets on at least five days of any week.
  await expect(page.getByRole('link', { name: /Board Prep Mon–Fri/ }).first()).toBeVisible();
  await expectNoA11yViolations(page);

  await page.goto(hostUrl(testInfo, 'demo-a', `/timetable?view=day&date=${day}`));
  await page.getByRole('link', { name: new RegExp(`Tabla ${tag}`) }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await sheet.getByRole('button', { name: 'Cancel this class' }).click();
  await sheet.getByLabel('Why').selectOption({ label: 'Something else' });
  await sheet.getByRole('button', { name: 'Cancel this class' }).click();
  await expect(page.getByText('Class cancelled')).toBeVisible();
  const card = page.getByRole('link', { name: new RegExp(`Tabla ${tag}`) });
  // The timetable re-renders on the server after the sheet closes; allow for a busy server.
  await expect(card).toContainText('Cancelled', { timeout: 15_000 });

  await card.click();
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await sheet.getByRole('button', { name: 'Add a make-up class' }).click();
  await sheet.getByLabel('Date').fill(istDate(3));
  await sheet.getByRole('button', { name: 'Add a make-up class' }).click();
  await expect(page.getByText('Make-up class added')).toBeVisible();
  await page.goto(hostUrl(testInfo, 'demo-a', `/timetable?view=day&date=${istDate(3)}`));
  await expect(page.getByRole('link', { name: new RegExp(`Tabla ${tag}`) })).toBeVisible();
});

test('a holiday previews what it cancels, then cancels exactly that; removing it brings them back', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Changes demo-a; run once');
  test.setTimeout(150_000);
  const tag = Date.now().toString(36);
  await signInAt(page, testInfo, 'demo-a', 'admin@demo-a.test');
  const day = istDate(25);
  await batchMeetingOn(page, testInfo, `Sitar ${tag}`, day);

  await page.goto(hostUrl(testInfo, 'demo-a', '/timetable/holidays'));
  await expect(
    page.getByRole('heading', { level: 1, name: 'Holidays and closures' }),
  ).toBeVisible();
  await expectNoA11yViolations(page);
  await expect(async () => {
    await page.getByRole('button', { name: 'Add a holiday' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Name').fill(`Diwali ${tag}`);
  await sheet.getByLabel('First day').fill(day);
  await sheet.getByRole('button', { name: 'See which classes it cancels' }).click();
  await expect(sheet.getByRole('heading', { name: `Diwali ${tag} cancels` })).toBeVisible();
  await expect(sheet.getByText(/\d+ classes? in \d+ batch/)).toBeVisible();
  await expect(sheet.getByText('Parents get a notice when notifications arrive')).toBeVisible();
  // Nothing has changed yet.
  const confirm = sheet.getByRole('button', { name: /^Add holiday and cancel \d+ class/ });
  const planned = Number(/(\d+)/.exec((await confirm.textContent()) ?? '')![1]);
  expect(planned).toBeGreaterThanOrEqual(1);
  await confirm.click();
  await expect(page.getByText(new RegExp(`Diwali ${tag} added; ${planned} class`))).toBeVisible();

  await page.goto(hostUrl(testInfo, 'demo-a', `/timetable?view=day&date=${day}`));
  await expect(page.getByText(`Diwali ${tag}`).first()).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(`Sitar ${tag}`) })).toContainText(
    'Cancelled',
  );

  // Remove it: the classes come back.
  await page.goto(hostUrl(testInfo, 'demo-a', '/timetable/holidays'));
  const row = page.getByRole('listitem').filter({ hasText: `Diwali ${tag}` });
  await row.getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText(`Diwali ${tag} removed; its classes are back`)).toBeVisible();
  await page.goto(hostUrl(testInfo, 'demo-a', `/timetable?view=day&date=${day}`));
  await expect(page.getByRole('link', { name: new RegExp(`Sitar ${tag}`) })).not.toContainText(
    'Cancelled',
  );
});

test('phones get a timeline; a teacher sees only their classes', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await signInAt(page, testInfo, 'demo-a', 'teacher@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/timetable'));
  await expect(page.getByRole('heading', { level: 1, name: 'Timetable' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Spoken English Tue\/Thu/ }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Board Prep Mon–Fri/ })).toHaveCount(0);
  await expectNoA11yViolations(page);
});
