import { expect, test } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';

const PAGES = ['/', '/offline', '/dev/design-system', '/does-not-exist'];

for (const path of PAGES) {
  test(`${path} has no WCAG 2.1 AA violations`, async ({ page }) => {
    await page.goto(path);
    await expectNoA11yViolations(page);
  });
}

test('design system screenshot for PO review', async ({ page }, testInfo) => {
  await page.goto('/dev/design-system');
  await expect(page.getByRole('heading', { name: 'Design system' })).toBeVisible();
  await page.screenshot({
    path: `artifacts/screenshots/design-system-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
