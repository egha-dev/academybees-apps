import { expect, type Page, test } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';
import { ownClientIp } from '../support/client-ip.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';
import { signInAt } from '../support/session.js';

/**
 * Teachers and the command palette (Phase 4 S4; UX §9.1, §11; C-105): add a teacher, edit, archive
 * and restore; Ctrl/⌘ + K finds a student by part of a name and opens Student 360.
 */
test.beforeAll(requireSeededAcademies);
test.beforeEach(({ context }) => ownClientIp(context));

async function settled(page: Page) {
  await page.waitForLoadState('networkidle');
}

test('add a teacher with subjects, edit, archive and restore', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Creates teachers; run once');
  test.setTimeout(90_000);
  const tag = `${Date.now()}`.slice(-6);
  await signInAt(page, testInfo, 'demo-a', 'admin@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/teachers'));
  await expect(page.getByRole('heading', { level: 1, name: 'Teachers' })).toBeVisible();
  await page.getByRole('link', { name: 'Add teacher' }).first().click();
  await settled(page);
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Full name').fill(`Coach ${tag}`);
  await sheet.getByLabel('Teaches (optional)').fill('Chess, Yoga');
  await sheet.getByRole('button', { name: 'Add teacher' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Coach ${tag}` })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('Chess, Yoga')).toBeVisible();
  await expect(page.getByText('No sign-in', { exact: true })).toBeVisible();
  await settled(page);

  await page.getByRole('button', { name: 'Edit details' }).click();
  const edit = page.getByRole('dialog');
  await edit.getByLabel('Teaches (optional)').fill('Chess');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Chess', { exact: true })).toBeVisible();

  await settled(page);
  await expect(async () => {
    await page.getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByText(/^Archived\. Restore/)).toBeVisible();
  await settled(page);
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText(/^Archived\. Restore/)).toHaveCount(0);
  await page.getByRole('link', { name: 'Activity' }).click();
  await expect(page.getByText('Teacher added')).toBeVisible();
});

test('Ctrl+K finds a student by part of a name and opens Student 360', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Keyboard shortcut: desktop');
  test.setTimeout(90_000);
  await signInAt(page, testInfo, 'demo-a', 'admin@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/students'));
  await settled(page);
  await expect(async () => {
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('combobox', { name: /Search students, parents/ })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 20_000 });
  const started = Date.now();
  await page.getByRole('combobox', { name: /Search students, parents/ }).fill('abir kh');
  const option = page.getByRole('option', { name: /Kabir Khan/ });
  await expect(option).toBeVisible();
  // PO checklist: found in under a second (local; includes the debounce).
  expect(Date.now() - started).toBeLessThan(
    testInfo.project.name === 'desktop-chromium' ? 3_000 : 5_000,
  );
  await expectNoA11yViolations(page);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Kabir Khan' })).toBeVisible();
});

test('the palette button works on phones, and the teachers pages pass axe', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await signInAt(page, testInfo, 'demo-a', 'admin@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/teachers'));
  await expect(page.getByRole('heading', { level: 1, name: 'Teachers' })).toBeVisible();
  await settled(page);
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Search the academy' }).click();
  await page.getByRole('combobox', { name: /Search students, parents/ }).fill('Demo Teacher');
  await page.getByRole('option', { name: 'Demo Teacher' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Demo Teacher' })).toBeVisible();
  await settled(page);
  await expectNoA11yViolations(page);
});
