import { expect, test } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';
import { ownClientIp } from '../support/client-ip.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';
import { signInAt } from '../support/session.js';

/**
 * Finance setup (S7): the owner says how they're paid, adds a fee plan with two items and puts a
 * batch on it. Runs once: the plan is named for this run, since the seeded academy keeps them.
 */
test.beforeAll(requireSeededAcademies);
test.beforeEach(({ context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One project (shared academy)');
  return ownClientIp(context);
});

test('settings, then a fee plan, then a batch on it', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const url = (path: string) => hostUrl(testInfo, 'demo-a', path);
  await signInAt(page, testInfo, 'demo-a', 'owner@demo-a.test');

  // Settings → Payments: a bad UPI ID is explained, a good one shows the QR and is kept.
  await page.goto(url('/settings/payments'));
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Not connected yet')).toBeVisible();
  await page.getByLabel('UPI ID').fill('nope');
  await page.getByLabel('Name shown when paying').fill('Demo Academy');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Enter a UPI ID like name@bank.')).toBeVisible();
  await page.getByLabel('UPI ID').fill('demoa@okbank');
  await expect(page.getByRole('img', { name: /QR code for paying Demo Academy/ })).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Payment settings saved')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('UPI ID')).toHaveValue('demoa@okbank');

  // Fees: a plan made of two items.
  const name = `Tuition ${Date.now()}`;
  await page.goto(url('/fees'));
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'New fee plan' }).click();
  await page.getByLabel('Plan name').fill(name);
  await page.getByLabel('Item').fill('Tuition');
  await page.getByLabel('Amount (₹)').fill('1,500');
  await page.getByRole('button', { name: 'Add an item' }).click();
  await page.getByLabel('Item').nth(1).fill('Materials');
  await page.getByLabel('Amount (₹)').nth(1).fill('250.50');
  await expect(page.getByTestId('plan-total')).toContainText('1,750.50');
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Fee plan saved')).toBeVisible();

  // The plan's page: nobody yet, then a whole batch.
  await page.getByRole('listitem').filter({ hasText: name }).getByRole('link').click();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  await expect(page.getByText('Nobody is on this plan yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Add students' }).click();
  await page.getByLabel('Batch').selectOption({ index: 1 });
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Add to plan' }).click();
  await expect(page.getByText('Added to the plan')).toBeVisible();
  await expect(page.getByText('Nobody is on this plan yet.')).toHaveCount(0);
  await expectNoA11yViolations(page);
});
