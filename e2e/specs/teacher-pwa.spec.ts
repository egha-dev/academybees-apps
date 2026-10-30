import { expect, test } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';
import { adminSession, classForDemoTeacher, rollCall } from '../support/classes.js';
import { ownClientIp } from '../support/client-ip.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';
import { signInAt } from '../support/session.js';

/**
 * Teacher PWA, online (Phase 6 S4; UX §12, §14; C-124, C-126): the teacher's classes come from
 * this device's copy; Take attendance → Mark all present → one exception → Save → synced once.
 * Each run makes its own batch, students and a class today, so the seed and the day of
 * the week don't matter.
 */
test.beforeAll(requireSeededAcademies);
test.beforeEach(({ context }) => ownClientIp(context));

test('the teacher takes attendance on the Teacher PWA; it reaches the academy once', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const tag = `${testInfo.project.name.split('-')[0]} ${Date.now().toString(36)}`;

  // The admin prepares the class in their own browser.
  const admin = await adminSession(browser, testInfo);
  // A class earlier today: the set-up used near midnight, exercised here on every run.
  const made = await classForDemoTeacher(admin, `Kathak ${tag}`, 3, { earlier: true });
  const sessionId = made.sessionId;
  const names = made.students.map((x) => x.name);

  // The teacher: Today shows the class from this device's copy.
  await signInAt(page, testInfo, 'demo-a', 'teacher@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/teach'));
  await expect(page.getByRole('heading', { level: 1, name: /^Hello, / })).toBeVisible({
    timeout: 30_000,
  });
  const classLink = page.getByRole('link', { name: new RegExp(`Kathak ${tag}`) });
  await expect(classLink.first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('All changes synced', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
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
  await expect(page.getByText('All changes synced', { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  // The academy has it once: 2 present, 1 absent.
  expect((await rollCall(admin, sessionId)).counts).toMatchObject({
    PRESENT: 2,
    ABSENT: 1,
    unmarked: 0,
  });

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
  await admin.context.close();
});
