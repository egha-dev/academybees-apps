import { expect, test, type TestInfo } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';
import { ownClientIp } from '../support/client-ip.js';
import { signInNewConsoleAdmin } from '../support/console.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';

/**
 * Provisioning console (C-02, UX v1.1 §2–3, §9): create an academy with live address feedback,
 * the activation screen, the list, the overview (suspend / reactivate) and the address tab
 * (change; the old address redirects). Desktop-first (UX §21), so desktop only.
 */
test.beforeAll(requireSeededAcademies);
test.beforeEach(({ context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'The console is desktop-first (UX §21)');
  return ownClientIp(context);
});

const PASSWORD = 'Saffron#Monsoon2026';
const consoleUrl =
  (testInfo: TestInfo) =>
  (path = '/') =>
    hostUrl(testInfo, 'console', path);

test('create an academy, open it, suspend and reactivate it, and change its address', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const url = consoleUrl(testInfo);
  const tag = `${Date.now()}`.slice(-6);
  await signInNewConsoleAdmin(page, url, `e2e-console-${tag}@academybees.test`, PASSWORD);

  await page.getByRole('link', { name: 'Create academy' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create an academy');

  // Reserved addresses are refused while typing.
  const address = page.getByLabel('Address');
  await address.fill('admin');
  await expect(page.getByTestId('slug-status')).toHaveAttribute('data-status', 'reserved');
  await expect(page.getByText('This address is reserved. Choose another.').first()).toBeVisible();
  await address.fill('www');
  await expect(page.getByTestId('slug-status')).toHaveAttribute('data-status', 'reserved');

  // The address follows the name; a taken one offers alternatives.
  await address.fill('demo-a');
  await expect(page.getByTestId('slug-status')).toHaveAttribute('data-status', 'taken');
  await expect(page.getByRole('button', { name: 'Use demo-a-academy' })).toBeVisible();

  const slug = `gurushethra-${tag}`;
  await page.getByLabel('Academy name').fill(`Gurushethra ${tag}`);
  await address.fill(slug);
  await expect(page.getByTestId('slug-status')).toHaveAttribute('data-status', 'available');
  await page.getByLabel('Academy type').click();
  await page.getByRole('option', { name: 'Dance' }).click();
  await page.getByLabel("Owner's name").fill('Lakshmi Raman');
  await page.getByLabel("Owner's email").fill(`owner-${tag}@example.test`);
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Create academy' }).click();

  // The activation moment: the address, Copy and Open.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Gurushethra ${tag} is ready`);
  await expect(page.getByTestId('academy-url')).toHaveText(
    hostUrl(testInfo, slug).replace(/\/$/, ''),
  );
  await expect(page.getByRole('button', { name: 'Copy address' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open academy' })).toHaveAttribute(
    'href',
    hostUrl(testInfo, slug).replace(/\/$/, ''),
  );
  await expect(page.getByText('Invitation sent, not accepted yet')).toBeVisible();
  await expectNoA11yViolations(page);

  // The list finds it.
  await page.goto(url('/academies'));
  await page.getByLabel('Name or address').fill(slug);
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('link', { name: `Gurushethra ${tag}` })).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByRole('link', { name: `Gurushethra ${tag}` }).click();

  // Suspend: the academy URL shows the suspended page; reactivate returns it to setting up.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Gurushethra ${tag}`);
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Suspend' }).click();
  await page.getByLabel('Reason').fill('Checking the suspended page');
  await page.getByRole('button', { name: 'Suspend academy' }).click();
  await expect(page.getByText(`Gurushethra ${tag} is suspended.`)).toBeVisible();
  await expect(page.getByText('Reason: Checking the suspended page')).toBeVisible();

  const academy = await page.context().newPage();
  await academy.goto(hostUrl(testInfo, slug));
  await expect(academy.getByRole('heading', { level: 1 })).toHaveText(
    `Gurushethra ${tag} is temporarily unavailable`,
  );
  await page.getByRole('button', { name: 'Reactivate' }).click();
  await page.getByLabel('Reason').fill('Back to setup');
  await page.getByRole('button', { name: 'Reactivate academy' }).click();
  await expect(page.getByText(`Gurushethra ${tag} is open again.`)).toBeVisible();

  // Change the address: the old one redirects to the new one.
  await page.getByRole('link', { name: 'Address' }).click();
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Change address' }).click();
  const moved = `${slug}-studio`;
  await page.getByLabel('New address').fill(moved);
  await expect(page.getByTestId('slug-status')).toHaveAttribute('data-status', 'available');
  await page.getByRole('dialog').getByRole('button', { name: 'Change address' }).click();
  await expect(page.getByTestId('current-address')).toHaveText(
    hostUrl(testInfo, moved).replace(/\/$/, ''),
  );
  const response = await academy.request.get(hostUrl(testInfo, slug, '/login'), {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(301);
  expect(response.headers().location).toBe(hostUrl(testInfo, moved, '/login'));
  await academy.close();
});

test('the console list and forms have no WCAG 2.1 AA violations in dark mode', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({ colorScheme: 'dark' });
  await ownClientIp(context);
  const page = await context.newPage();
  const url = consoleUrl(testInfo);
  await signInNewConsoleAdmin(
    page,
    url,
    `e2e-console-dark-${Date.now()}@academybees.test`,
    PASSWORD,
  );
  await expectNoA11yViolations(page);
  await page.goto(url('/academies/new'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create an academy');
  await expectNoA11yViolations(page);
  await context.close();
});
