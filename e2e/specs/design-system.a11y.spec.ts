import { expect, test } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';

const PAGES = ['/', '/offline', '/dev/design-system', '/does-not-exist'];
const THEMES = ['light', 'dark'] as const;

/** WCAG 2.1 AA (colour contrast included) in both themes (C-49). */
for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });

    for (const path of PAGES) {
      test(`${path} has no WCAG 2.1 AA violations`, async ({ page }) => {
        await page.goto(path);
        await expect(page.locator('html')).toHaveAttribute('data-ab-theme', theme);
        await expectNoA11yViolations(page);
      });
    }

    test('design system screenshot for PO review', async ({ page }, testInfo) => {
      await page.goto('/dev/design-system');
      await expect(page.getByRole('heading', { name: 'Design system' })).toBeVisible();
      await page.screenshot({
        path: `artifacts/screenshots/design-system-${theme}-${testInfo.project.name}.png`,
        fullPage: true,
      });
    });
  });
}
