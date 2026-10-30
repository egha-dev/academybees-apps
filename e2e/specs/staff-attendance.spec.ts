import { expect, test } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';
import { adminSession, classForDemoTeacher, istNow, rollCall, uuidv7 } from '../support/classes.js';
import { writeInAcademy } from '../support/db.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';

/**
 * Attendance for owners and admins (Phase 6 S6; G-16, C-131): Today lists a class that ended
 * without a roll call; the admin takes it with the teachers' screen and queue; the overview, the
 * Batch Workspace and Student 360 show it. The seed's two weeks of attendance give percentages.
 */
test.beforeAll(requireSeededAcademies);

const BOARD_PREP = '01a10000-0000-7000-8000-0000005c0003';

test('a class not taken shows on Today; the admin takes it; the views show it', async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  test.skip(istNow().minutes < 60, 'Needs a class that has ended today');
  const tag = `${testInfo.project.name.split('-')[0]} ${Date.now().toString(36)}`;
  const admin = await adminSession(browser, testInfo);
  const { page } = admin;
  try {
    const { batchId, students } = await classForDemoTeacher(admin, `Yakshagana ${tag}`, 2);
    // A class early today that has already ended, with no roll call (the API refuses past times).
    const ended = uuidv7();
    await writeInAcademy(
      'demo-a',
      `INSERT INTO class_session (id, tenant_id, branch_id, batch_id, session_date, starts_at, ends_at,
         origin, updated_at)
       SELECT $2, $1, b.branch_id, b.id, $4::date, ($4::date + time '00:05') AT TIME ZONE 'Asia/Kolkata',
              ($4::date + time '00:35') AT TIME ZONE 'Asia/Kolkata', 'MANUAL', now()
         FROM batch b WHERE b.id = $3`,
      [ended, batchId, istNow().date],
    );

    await page.goto(hostUrl(testInfo, 'demo-a', '/today'));
    const notTaken = page.getByRole('link', {
      name: `Attendance not taken: Yakshagana ${tag} at 00:05`,
    });
    await expect(notTaken).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/\d+ of \d+ roll calls taken/)).toBeVisible();
    await notTaken.click();

    // The teachers' attendance screen, in the Manage experience (C-131).
    await expect(page.getByRole('heading', { level: 1, name: `Yakshagana ${tag}` })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Mark all present' }).click();
    await page.getByRole('button', { name: 'Save attendance' }).click();
    await expect(page.getByText('Saved on this device. It syncs automatically.')).toBeVisible();
    // Then the queue sends it: the academy has it (the status line may still say "synced" from
    // before the save for a moment, so ask the server).
    await expect
      .poll(async () => (await rollCall(admin, ended)).counts, { timeout: 30_000 })
      .toMatchObject({ PRESENT: 2, unmarked: 0 });
    await expect(page.getByText('All changes synced', { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });

    // The overview: taken.
    await page.goto(hostUrl(testInfo, 'demo-a', '/attendance'));
    await expect(page.getByRole('heading', { level: 1, name: 'Attendance' })).toBeVisible();
    await expect(
      page
        .getByRole('listitem')
        .filter({ hasText: `Yakshagana ${tag}` })
        .filter({ hasText: '00:05' }),
    ).toContainText('Taken');
    await expectNoA11yViolations(page);

    // The Batch Workspace: the class and the percentage.
    await page.goto(hostUrl(testInfo, 'demo-a', `/batches/${batchId}?tab=attendance`));
    await expect(
      page.getByRole('main').getByText('Attendance over these 4 weeks: 100%'),
    ).toBeVisible();
    await expectNoA11yViolations(page);

    // Student 360: this month.
    await page.goto(hostUrl(testInfo, 'demo-a', `/students/${students[0]!.id}?tab=attendance`));
    await expect(page.getByRole('heading', { name: 'By month' })).toBeVisible();
    await expect(page.getByRole('main').getByText(/%/).first()).toBeVisible();
    await expectNoA11yViolations(page);
  } finally {
    await admin.context.close();
  }
});

test('the seed’s two weeks of attendance give a batch its percentage', async ({
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  const admin = await adminSession(browser, testInfo);
  try {
    await admin.page.goto(hostUrl(testInfo, 'demo-a', `/batches/${BOARD_PREP}?tab=attendance`));
    await expect(
      admin.page.getByRole('main').getByText(/Attendance over these 4 weeks: \d+(\.\d)?%/),
    ).toBeVisible();
    await expect(
      admin.page.getByRole('listitem').filter({ hasText: 'Taken' }).first(),
    ).toBeVisible();
  } finally {
    await admin.context.close();
  }
});
