import { totpCode } from '@academybee/auth';
import { expect, type Page, test, type TestInfo } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';
import { ownClientIp } from '../support/client-ip.js';
import { createConsoleAdmin } from '../support/console.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';
import { DEV_PASSWORD, signIn } from '../support/session.js';

/**
 * Family Hub and console sign-in (plan 2.19, 2.20; ADR-039, C-61, C-66): a parent signing in on
 * the academy URL lands on `app.` with a hub session; parents can also sign in on `app.`; a new
 * console admin sets a password from the CLI link, enrols TOTP, saves recovery codes and signs in.
 */
test.beforeAll(requireSeededAcademies);
test.beforeEach(({ context }) => ownClientIp(context));

const CONSOLE_PASSWORD = 'Harbour#Lantern2026';

async function waitOff(page: Page, path: string) {
  await page.waitForURL((url) => !url.pathname.startsWith(path), { timeout: 15_000 });
}

test('a parent signing in on the academy URL continues on the Family Hub', async ({
  page,
}, testInfo) => {
  await page.goto(hostUrl(testInfo, 'demo-a', '/login'));
  await signIn(page, 'parent@demo-a.test');
  await expect(page).toHaveURL(hostUrl(testInfo, 'app', '/'), { timeout: 15_000 });
  // The one-time code never stays in the address bar.
  expect(page.url()).not.toContain('code=');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hello, Priya Parent');
  await expect(page.getByRole('heading', { name: 'Demo A Academy' })).toBeVisible();
  await expect(page.getByText('Parent', { exact: true })).toBeVisible();

  // The hub session does not work on the academy host.
  await page.goto(hostUrl(testInfo, 'demo-a', '/today'));
  await expect(page).toHaveURL(/\/login/);

  await page.goto(hostUrl(testInfo, 'app', '/'));
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(hostUrl(testInfo, 'app', '/login'));
});

test('a used or missing handoff code asks to sign in again', async ({ page }, testInfo) => {
  await page.goto(hostUrl(testInfo, 'app', '/auth/handoff#code=' + 'x'.repeat(43)));
  await expect(page.getByText('This sign-in link has expired')).toBeVisible();
  await page.getByRole('link', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(hostUrl(testInfo, 'app', '/login'));
});

test('parents and students sign in on app. directly; staff cannot', async ({ page }, testInfo) => {
  await page.goto(hostUrl(testInfo, 'app'));
  await expect(page).toHaveURL(hostUrl(testInfo, 'app', '/login'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to the Family Hub');
  await signIn(page, 'owner@demo-a.test');
  await expect(page.getByRole('main').getByRole('alert')).toContainText("doesn't match");
  await signIn(page, 'student@demo-a.test');
  await waitOff(page, '/login');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hello, Sanjay Student');
});

const adminEmail = (testInfo: TestInfo) =>
  `e2e-console-${testInfo.project.name}-${Date.now()}@academybees.test`;

test('a new console admin sets a password, enrols TOTP and signs in again with a recovery code', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const email = adminEmail(testInfo);
  const link = createConsoleAdmin(email);
  const consoleUrl = (path = '/') => hostUrl(testInfo, 'console', path);

  // Set the password from the CLI link (also emailed).
  await page.goto(link.replace('http://console.localhost:3000', consoleUrl('').replace(/\/$/, '')));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Choose your console password');
  await page.getByLabel('New password', { exact: true }).fill(CONSOLE_PASSWORD);
  await page.getByLabel('Confirm new password', { exact: true }).fill(CONSOLE_PASSWORD);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await page.getByRole('link', { name: 'Sign in' }).click();

  // First sign-in: enrol an authenticator app.
  await expect(page).toHaveURL(consoleUrl('/login'));
  await signIn(page, email, CONSOLE_PASSWORD);
  await expect(page.getByRole('heading', { name: 'Set up two-step sign-in' })).toBeVisible();
  await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible();
  const secret = (await page.getByTestId('manual-key').innerText()).replace(/\s/g, '');
  await page.getByLabel('6-digit code').fill(totpCode(secret));
  await page.getByRole('button', { name: 'Verify and continue' }).click();

  // Recovery codes, once.
  await expect(page.getByRole('heading', { name: 'Save your recovery codes' })).toBeVisible();
  const codes = await page
    .getByRole('list', { name: 'Recovery codes' })
    .getByRole('listitem')
    .allInnerTexts();
  expect(codes).toHaveLength(10);
  await page.getByRole('button', { name: "I've saved them — continue" }).click();
  await expect(page).toHaveURL(consoleUrl('/'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Signed in to the console');
  await expect(page.getByText('(Super Admin)')).toBeVisible();

  // The console session is not an academy session.
  await page.goto(hostUrl(testInfo, 'demo-a', '/today'));
  await expect(page).toHaveURL(/\/login/);

  await page.goto(consoleUrl('/'));
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(consoleUrl('/login'));

  // Every sign-in needs the second factor; a recovery code works (the TOTP step was just used).
  await signIn(page, email, CONSOLE_PASSWORD);
  await expect(page.getByRole('heading', { name: 'Enter your sign-in code' })).toBeVisible();
  await page.getByRole('button', { name: 'Use a recovery code instead' }).click();
  await page.getByLabel('Recovery code').fill(codes[0]!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(consoleUrl('/'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Signed in to the console');
});

test('academy staff cannot sign in to the console', async ({ page }, testInfo) => {
  await page.goto(hostUrl(testInfo, 'console'));
  await expect(page).toHaveURL(hostUrl(testInfo, 'console', '/login'));
  await signIn(page, 'owner@demo-a.test', DEV_PASSWORD);
  await expect(page.getByRole('main').getByRole('alert')).toContainText("doesn't match");
});

for (const theme of ['light', 'dark'] as const) {
  test(`hub and console sign-in have no WCAG 2.1 AA violations (${theme})`, async ({
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Checked once on desktop');
    const context = await browser.newContext({ colorScheme: theme });
    await ownClientIp(context);
    const page = await context.newPage();
    for (const sub of ['app', 'console']) {
      await page.goto(hostUrl(testInfo, sub, '/login'));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoA11yViolations(page);
    }
    await context.close();
  });
}
