import { expect, test } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';
import { ownClientIp } from '../support/client-ip.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';
import { signInAt, signOut } from '../support/session.js';

/**
 * Phase 5 exit gate: create a batch with a weekly schedule → its classes appear in the
 * timetable's week view → cancel one → a teacher who signs in sees only their own batches.
 * Runs on desktop and phones (each project makes its own batch).
 */
test.beforeAll(requireSeededAcademies);
test.beforeEach(({ context }) => ownClientIp(context));

/** Academy-local (IST) calendar date `days` from now: next week is always a full Mon–Fri. */
const istDate = (days: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
    new Date(Date.now() + days * 86_400_000),
  );

test('batch with a weekly schedule → week view → cancel one → teacher sees only theirs', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const name = `Bharatanatyam ${testInfo.project.name.split('-')[0]} ${Date.now().toString(36)}`;
  const nextWeek = istDate(7);

  // 1. The admin creates a batch and gives it a Mon–Fri pattern.
  await signInAt(page, testInfo, 'demo-a', 'admin@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/batches?add=1'));
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await sheet.getByLabel('Name', { exact: true }).fill(name);
  await sheet.getByRole('button', { name: 'Add and set days' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 20_000 });
  const batchUrl = page.url().split('?')[0]!;
  await page.waitForLoadState('networkidle');
  const editor = page.getByRole('dialog');
  await expect(async () => {
    if (!(await editor.isVisible()))
      // Short click timeout: if the editor opens meanwhile, its backdrop covers the button.
      await page.getByRole('button', { name: 'Set days and times' }).click({ timeout: 2_000 });
    await expect(editor).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await editor.getByRole('button', { name: 'Mon–Fri', exact: true }).click();
  await editor.getByRole('button', { name: 'Save days and times' }).click();
  await expect(page.getByText('Saved. Classes for the next 4 weeks are ready.')).toBeVisible();

  // 2. Its classes are in next week's timetable, one a day.
  await page.goto(hostUrl(testInfo, 'demo-a', `/timetable?view=week&date=${nextWeek}`));
  const classes = page.getByRole('link', { name: new RegExp(name) });
  await expect(classes).toHaveCount(5);
  await expectNoA11yViolations(page);

  // 3. Cancel one from its sheet.
  await classes.first().click();
  const session = page.getByRole('dialog');
  await expect(session).toBeVisible({ timeout: 20_000 });
  await session.getByRole('button', { name: 'Cancel this class' }).click();
  await session.getByRole('button', { name: 'Cancel this class' }).click();
  await expect(page.getByText('Class cancelled')).toBeVisible();
  // The timetable re-renders on the server after the sheet closes; allow for a busy server.
  await expect(classes.first()).toContainText('Cancelled', { timeout: 15_000 });
  await expect(classes.nth(1)).not.toContainText('Cancelled');

  // 4. The demo teacher (not this batch's teacher) sees only their own batches.
  await signOut(page, testInfo);
  await signInAt(page, testInfo, 'demo-a', 'teacher@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/teach'));
  await expect(page.getByRole('link', { name: 'Spoken English Tue/Thu' })).toBeVisible();
  await expect(page.getByText(name)).toHaveCount(0);
  await page.goto(hostUrl(testInfo, 'demo-a', `/timetable?view=week&date=${nextWeek}`));
  await expect(page.getByRole('link', { name: /Spoken English Tue\/Thu/ }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(name) })).toHaveCount(0);
  await page.goto(batchUrl);
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
  await signOut(page, testInfo);

  // Tidy up: archive the journey's batch.
  await signInAt(page, testInfo, 'demo-a', 'admin@demo-a.test');
  await page.goto(batchUrl);
  await page.getByRole('button', { name: 'Archive' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByText('Archived').first()).toBeVisible();
});
