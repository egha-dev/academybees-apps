import { expect, test } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';

/** WCAG 2.1 AA on academy pages and status pages in both themes (C-49, UX v1.1 §7). */
const PAGES = [
  ['demo-a', '/login'],
  ['demo-a', '/forgot-password'],
  ['demo-a', '/reset-password#token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
  ['demo-a', '/invite#token=not-a-real-invitation-token-123'],
  ['demo-a', '/access-denied'],
  ['nope', '/'],
  ['paused', '/'],
  ['closed-demo', '/'],
  ['setup-demo', '/'],
  ['app', '/'],
] as const;

test.beforeAll(requireSeededAcademies);

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });
    for (const [subdomain, path] of PAGES) {
      test(`${subdomain}${path} has no WCAG 2.1 AA violations`, async ({ page }, testInfo) => {
        await page.goto(hostUrl(testInfo, subdomain, path));
        await expect(page.locator('html')).toHaveAttribute('data-ab-theme', theme);
        await expectNoA11yViolations(page);
      });
    }
  });
}
