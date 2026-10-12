import { expect, type Page, test } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';
import { ownClientIp } from '../support/client-ip.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';
import { signInAt } from '../support/session.js';

/**
 * Batches and the Batch Workspace (UX §11.5; C-113, C-117, C-120, C-121): add a batch, set a
 * Mon/Wed/Fri pattern from a preset, add students with day plans and the per-day capacity
 * warning, move a student; the seeded timetable (packages/database/src/seed/scheduling.ts) shows
 * real patterns; a teacher sees only their batches, read-only.
 */
test.beforeAll(requireSeededAcademies);
test.beforeEach(({ context }) => ownClientIp(context));

const SPOKEN_ENGLISH = '01a10000-0000-7000-8000-0000005c0002';
const BOARD_PREP = '01a10000-0000-7000-8000-0000005c0003';

async function settled(page: Page) {
  await page.waitForLoadState('networkidle');
}

test('add a batch, set Mon/Wed/Fri, add students on some days, warn at capacity, move one', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Creates data in demo-a; run once');
  test.setTimeout(150_000);
  const tag = Date.now().toString(36);
  await signInAt(page, testInfo, 'demo-a', 'admin@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/batches'));
  await expect(page.getByRole('heading', { level: 1, name: 'Batches' })).toBeVisible();
  await settled(page);
  await page.getByRole('link', { name: 'Add batch' }).first().click();
  await settled(page);
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Name', { exact: true }).fill(`Karate ${tag}`);
  await sheet.getByLabel('Most students a day').fill('1');
  await sheet.getByRole('button', { name: 'Add and set days' }).click();

  // The workspace opens on Days and times with the editor.
  await expect(page.getByRole('heading', { level: 1, name: `Karate ${tag}` })).toBeVisible({
    timeout: 20_000,
  });
  await settled(page);
  const editor = page.getByRole('dialog');
  await expect(async () => {
    if (!(await editor.isVisible()))
      // Short click timeout: if the editor opens meanwhile, its backdrop covers the button.
      await page.getByRole('button', { name: 'Set days and times' }).click({ timeout: 2_000 });
    await expect(editor).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await editor.getByRole('button', { name: 'Mon, Wed, Fri' }).click();
  await expect(editor.getByText('3 classes a week')).toBeVisible();
  await editor.getByRole('button', { name: 'Save days and times' }).click();
  await expect(page.getByText('Saved. Classes for the next 4 weeks are ready.')).toBeVisible();
  await expect(page.getByText('Monday 17:00–18:00')).toBeVisible();
  await expect(page.getByText('3 classes a week')).toBeVisible();
  await expectNoA11yViolations(page);

  // A student who comes only on Wednesdays, then one every day: over the limit of 1.
  await page.getByRole('link', { name: 'Students' }).last().click();
  await settled(page);
  const enrol = async (name: string, wednesdayOnly: boolean) => {
    await expect(async () => {
      await page.getByRole('button', { name: 'Add a student' }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    const d = page.getByRole('dialog');
    await d.getByLabel('Find a student').fill(name.split(' ')[0]!);
    await expect(d.getByLabel('Student', { exact: true })).toBeVisible({ timeout: 10_000 });
    // Wait for this search's results, then pick the student by their option.
    const option = d.getByRole('option', { name: new RegExp(name) });
    await expect(option).toHaveCount(1, { timeout: 10_000 });
    await d
      .getByLabel('Student', { exact: true })
      .selectOption({ label: (await option.textContent()) ?? name });
    if (wednesdayOnly) {
      await d.getByLabel('Which days does this student come?').first().selectOption('some');
      await d.getByRole('checkbox', { name: 'Wednesday' }).check();
    }
    await d.getByRole('button', { name: 'Add', exact: true }).click();
    return d;
  };
  await enrol('Kabir Khan', true);
  await expect(page.getByText('Kabir Khan added')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Kabir Khan' })).toBeVisible();
  await expect(page.getByText(/Wed · 1 class a week/)).toBeVisible();
  const second = await enrol('Diya Iyer', false);
  await expect(second.getByText(/This would go over the limit on Wednesday/)).toBeVisible();
  await second.getByRole('button', { name: 'Add anyway' }).click();
  await expect(page.getByText('Diya Iyer added')).toBeVisible();

  // Move Diya, from tomorrow, to a second batch made for this test (a clean target on every run).
  const csrf = (await page.context().cookies()).find((c) => c.name.endsWith('ab_csrf'))!.value;
  const target = await page.request.post(hostUrl(testInfo, 'demo-a', '/api/v1/batches'), {
    headers: { 'x-csrf-token': csrf, 'idempotency-key': crypto.randomUUID() },
    data: { name: `Karate B ${tag}`, courseId: '01a10000-0000-7000-8000-00000000c001' },
  });
  expect(target.status()).toBe(201);
  const row = page.getByRole('listitem').filter({ hasText: 'Diya Iyer' });
  await row.getByRole('button', { name: 'Move to another batch' }).click();
  const move = page.getByRole('dialog');
  await move.getByLabel('Move to').selectOption({ label: `Karate B ${tag}` });
  await move.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(page.getByText('Diya Iyer moved')).toBeVisible();

  // Tidy up: archive the test batch.
  await page.getByRole('button', { name: 'Archive' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByText('Archived').first()).toBeVisible();
});

test('the list shows real patterns: days, how full the fullest day is, next class', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await signInAt(page, testInfo, 'demo-a', 'owner@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/batches'));
  const board = page.getByRole('link', { name: /Board Prep Mon–Fri/ });
  await expect(board).toBeVisible();
  await expect(board).toContainText('Mon, Tue, Wed, Thu, Fri');
  await expect(board).toContainText(/Fullest: \w+ 3 of 3/);
  await expect(page.getByRole('link', { name: /Spoken English Tue\/Thu/ })).toContainText(
    'Tue, Thu',
  );
  await expectNoA11yViolations(page);
  await page.goto(hostUrl(testInfo, 'demo-a', `/batches/${BOARD_PREP}?tab=schedule`));
  await expect(page.getByText('5 classes a week').first()).toBeVisible();
});

test('a teacher sees only their batches, read-only', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await signInAt(page, testInfo, 'demo-a', 'teacher@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/teach'));
  const mine = page.getByRole('heading', { name: 'My batches' }).locator('..');
  await expect(page.getByRole('link', { name: 'Spoken English Tue/Thu' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Grade 8 — Evening' })).toBeVisible();
  await expect(mine.getByText('Board Prep Mon–Fri')).toHaveCount(0);
  await page.goto(hostUrl(testInfo, 'demo-a', `/batches/${SPOKEN_ENGLISH}`));
  await expect(
    page.getByRole('heading', { level: 1, name: 'Spoken English Tue/Thu' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add a student' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit details' })).toHaveCount(0);
  await page.goto(hostUrl(testInfo, 'demo-a', `/batches/${BOARD_PREP}`));
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
});
