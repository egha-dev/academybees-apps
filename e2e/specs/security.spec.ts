import { totpCode } from '@academybee/auth';
import { type Browser, expect, type Page, test, type TestInfo } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';
import { ownClientIp } from '../support/client-ip.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';
import { acceptViaApi, inviteViaApi, signIn } from '../support/session.js';

/**
 * Account security (plan 2.21, 2.22; G-11, C-80): an Accountant gets the strong prompt after
 * sign-in, sets up two-step sign-in from the Security page and needs a code next time; a teacher
 * sees their devices, signs one out and changes their password.
 */
test.beforeAll(requireSeededAcademies);
test.beforeEach(({ context }) => ownClientIp(context));

const PASSWORD = 'Lantern#Harbour2026';
const NEW_PASSWORD = 'Monsoon#Teapot2026';

const unique = (testInfo: TestInfo, label: string) =>
  `e2e-${label}-${testInfo.project.name}-${Date.now()}@example.test`;

/** A new member of demo-a, invited and accepted through the API. */
async function newMember(browser: Browser, testInfo: TestInfo, label: string, role: string) {
  const email = unique(testInfo, label);
  const context = await browser.newContext();
  await ownClientIp(context);
  await inviteViaApi(context, testInfo, email, [role]);
  await acceptViaApi(context, testInfo, email, `E2E ${label}`, PASSWORD);
  await context.close();
  return email;
}

const securityUrl = (testInfo: TestInfo) => hostUrl(testInfo, 'demo-a', '/settings/security');

async function signInTo(page: Page, testInfo: TestInfo, email: string, password = PASSWORD) {
  await page.goto(hostUrl(testInfo, 'demo-a', '/login'));
  await signIn(page, email, password);
}

test('an accountant is prompted, sets up two-step sign-in and needs a code next time', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  const email = await newMember(browser, testInfo, 'accountant', 'accountant');

  await signInTo(page, testInfo, email);
  await expect(page).toHaveURL(`${securityUrl(testInfo)}?prompt=mfa`, { timeout: 15_000 });
  const prompt = page.getByRole('region', { name: "Protect Demo A Academy's money and records" });
  await expect(prompt).toBeVisible();
  await expect(page.getByText('Off', { exact: true })).toBeVisible();

  await prompt.getByRole('button', { name: 'Set up two-step sign-in' }).click();
  const sheet = page.getByRole('dialog', { name: 'Set up two-step sign-in' });
  await sheet.getByLabel('Current password', { exact: true }).fill('Wrong#Password2026');
  await sheet.getByRole('button', { name: 'Continue' }).click();
  await expect(sheet.getByRole('alert')).toHaveText("That password isn't right.");
  await sheet.getByLabel('Current password', { exact: true }).fill(PASSWORD);
  await sheet.getByRole('button', { name: 'Continue' }).click();

  await expect(sheet.getByRole('img', { name: /QR code/ })).toBeVisible();
  const secret = (await sheet.getByTestId('manual-key').innerText()).replace(/\s/g, '');
  await sheet.getByLabel('6-digit code').fill(totpCode(secret));
  await sheet.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(sheet.getByRole('heading', { name: 'Save your recovery codes' })).toBeVisible();
  const codes = await sheet
    .getByRole('list', { name: 'Recovery codes' })
    .getByRole('listitem')
    .allInnerTexts();
  expect(codes).toHaveLength(10);
  await sheet.getByRole('button', { name: "I've saved them — continue" }).click();
  await expect(page.getByText('Two-step sign-in is on.')).toBeVisible();
  await expect(page.getByText('On', { exact: true })).toBeVisible();
  await expect(prompt).toBeHidden();
  await expect(page.getByText('10 recovery codes left.')).toBeVisible();

  // Signed out, the next sign-in asks for a code (the next time step: the last one is used).
  await page.context().clearCookies();
  await signInTo(page, testInfo, email);
  await expect(page.getByRole('heading', { name: 'Enter your sign-in code' })).toBeVisible();
  await page.getByLabel('6-digit code').fill(totpCode(secret, Date.now() + 30_000));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(hostUrl(testInfo, 'demo-a', '/today'), { timeout: 15_000 });
});

test('a teacher signs out their other devices and changes their password', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  const email = await newMember(browser, testInfo, 'devices', 'teacher');

  const other = await browser.newContext();
  await ownClientIp(other);
  const otherPage = await other.newPage();
  await signInTo(otherPage, testInfo, email);
  await expect(otherPage).toHaveURL(hostUrl(testInfo, 'demo-a', '/teach'), { timeout: 15_000 });

  await signInTo(page, testInfo, email);
  await expect(page).toHaveURL(hostUrl(testInfo, 'demo-a', '/teach'), { timeout: 15_000 });
  await page.goto(securityUrl(testInfo));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Security');
  const devices = page.getByRole('region', { name: 'Devices' });
  // The invitation accept (another browser) signed in too: three devices, each with its own
  // "Sign out" except this one.
  await expect(devices.getByRole('listitem')).toHaveCount(3);
  await expect(devices.getByText('This device')).toBeVisible();
  await expect(devices.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(2);

  await devices.getByRole('button', { name: 'Sign out all other devices' }).click();
  await expect(page.getByText('Other devices are signed out.')).toBeVisible();
  await expect(devices.getByRole('listitem')).toHaveCount(1);
  await expect(devices.getByText('Only this device is signed in.')).toBeVisible();
  await otherPage.goto(hostUrl(testInfo, 'demo-a', '/teach'));
  await expect(otherPage).toHaveURL(/\/login/);
  await other.close();

  await page.getByRole('button', { name: 'Change password' }).click();
  const sheet = page.getByRole('dialog', { name: 'Change password' });
  await sheet.getByLabel('Current password', { exact: true }).fill(PASSWORD);
  await sheet.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await sheet.getByRole('button', { name: 'Change password' }).click();
  await expect(
    page.getByText('Password changed. Other devices now need the new password.'),
  ).toBeVisible();

  await page.context().clearCookies();
  await signInTo(page, testInfo, email);
  await expect(page.getByRole('main').getByRole('alert')).toContainText("doesn't match");
  await signIn(page, email, NEW_PASSWORD);
  await expect(page).toHaveURL(hostUrl(testInfo, 'demo-a', '/teach'), { timeout: 15_000 });
});

for (const theme of ['light', 'dark'] as const) {
  test(`the Security page has no WCAG 2.1 AA violations (${theme})`, async ({
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Checked once on desktop');
    const context = await browser.newContext({ colorScheme: theme });
    await ownClientIp(context);
    const page = await context.newPage();
    await signInTo(page, testInfo, 'owner@demo-a.test', 'AcademyBees#2026');
    await expect(page).toHaveURL(`${securityUrl(testInfo)}?prompt=mfa`, { timeout: 15_000 });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Security');
    await expectNoA11yViolations(page);
    await context.close();
  });
}
