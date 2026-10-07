import { type BrowserContext, expect, type Page, test, type TestInfo } from '@playwright/test';

import { ownClientIp } from '../support/client-ip.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';
import { waitForEmail } from '../support/mail.js';
import { signOut } from '../support/session.js';

/**
 * Phase 2 sign-in journeys (plan 2.16, UX Tier 1 Login): academy-branded login, role homes,
 * return-to after sign-in, sign-out (Family Hub users: hub-console.spec.ts), and the emailed flows end to end —
 * invite → accept → signed in, forgot → reset → sign in — through the worker and Mailpit.
 * Seeded users (local/ci only): `<role>@demo-a.test` with the dev password.
 */
const DEV_PASSWORD = 'AcademyBees#2026';

test.beforeAll(requireSeededAcademies);
test.beforeEach(({ context }) => ownClientIp(context));

async function signIn(page: Page, identifier: string, password = DEV_PASSWORD) {
  await page.getByLabel('Email or mobile number').fill(identifier);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** The sign-in form's own message (Next's route announcer is also an alert). */
const formAlert = (page: Page) => page.getByRole('main').getByRole('alert');

const unique = (testInfo: TestInfo, label: string) =>
  `e2e-${label}-${testInfo.project.name}-${Date.now()}@example.test`;

test('the academy URL opens its own sign-in; the owner is asked for 2FA, then Today, then signs out', async ({
  page,
}, testInfo) => {
  await page.goto(hostUrl(testInfo, 'demo-a'));
  await expect(page).toHaveURL(hostUrl(testInfo, 'demo-a', '/login'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to Demo A Academy');
  await expect(page.getByRole('banner').getByText('Demo A Academy')).toBeVisible();

  await signIn(page, 'owner@demo-a.test');
  // An Owner without two-step sign-in gets the strong prompt first (G-11, C-80).
  await expect(page).toHaveURL(hostUrl(testInfo, 'demo-a', '/settings/security?prompt=mfa'));
  await expect(
    page.getByRole('heading', { name: "Protect Demo A Academy's money and records" }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Not now' }).click();
  await expect(page).toHaveURL(hostUrl(testInfo, 'demo-a', '/today'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Signed in to Demo A Academy');

  // Signed in, the sign-in page and the root both go home.
  await page.goto(hostUrl(testInfo, 'demo-a', '/login'));
  await expect(page).toHaveURL(hostUrl(testInfo, 'demo-a', '/today'));

  await signOut(page, testInfo);
  await page.goto(hostUrl(testInfo, 'demo-a', '/today'));
  await expect(page).toHaveURL(/\/login\?next=%2Ftoday$/);
});

test('a teacher lands on Teach, and Today sends them there', async ({ page }, testInfo) => {
  await page.goto(hostUrl(testInfo, 'demo-a', '/login'));
  await signIn(page, 'teacher@demo-a.test');
  await expect(page).toHaveURL(hostUrl(testInfo, 'demo-a', '/teach'));
  await page.goto(hostUrl(testInfo, 'demo-a', '/today'));
  await expect(page).toHaveURL(hostUrl(testInfo, 'demo-a', '/teach'));
});

test('after signing in you return to the page you asked for', async ({ page }, testInfo) => {
  await page.goto(hostUrl(testInfo, 'demo-a', '/today'));
  await expect(page).toHaveURL(/\/login\?next=%2Ftoday$/);
  await signIn(page, 'admin@demo-a.test');
  await expect(page).toHaveURL(hostUrl(testInfo, 'demo-a', '/today'));
});

test('wrong details get one message; no cookie, no hint which part was wrong', async ({
  page,
  context,
}, testInfo) => {
  await page.goto(hostUrl(testInfo, 'demo-a', '/login'));
  await signIn(page, 'nobody@demo-a.test', 'Not-The-Password-1');
  await expect(formAlert(page)).toHaveText(
    "That email or password doesn't match. Check them and try again.",
  );
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  expect((await context.cookies()).filter((c) => c.name.includes('ab_at'))).toEqual([]);
});

test('empty fields are explained before anything is sent', async ({ page }, testInfo) => {
  await page.goto(hostUrl(testInfo, 'demo-a', '/login'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Enter this to continue.')).toHaveCount(2);
});

test('a demo-a account cannot sign in on demo-b', async ({ page }, testInfo) => {
  await page.goto(hostUrl(testInfo, 'demo-b', '/login'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Sign in to Demo B Dance Studio',
  );
  await signIn(page, 'admin@demo-a.test');
  await expect(formAlert(page)).toContainText("doesn't match");
});

test('offline: sign-in explains why it is unavailable', async ({ page, context }, testInfo) => {
  await page.goto(hostUrl(testInfo, 'demo-a', '/login'));
  await context.setOffline(true);
  await expect(
    page.getByText("You're offline. Connect to the internet to continue."),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
});

/** The owner invites someone through the API, as the Team page will (S7). */
async function inviteAs(context: BrowserContext, testInfo: TestInfo, email: string) {
  const login = await context.request.post(hostUrl(testInfo, 'demo-a', '/api/v1/auth/login'), {
    data: { identifier: 'owner@demo-a.test', password: DEV_PASSWORD },
  });
  expect(login.status()).toBe(200);
  const csrf = (await context.cookies()).find((c) => c.name.endsWith('ab_csrf'))!.value;
  const res = await context.request.post(hostUrl(testInfo, 'demo-a', '/api/v1/team/invitations'), {
    headers: { 'x-csrf-token': csrf, 'idempotency-key': crypto.randomUUID() },
    data: { email, roles: ['teacher'] },
  });
  expect(res.status()).toBe(201);
  await context.clearCookies();
}

test('invite → accept → signed in; then forgot → reset → sign in with the new password', async ({
  page,
  context,
}, testInfo) => {
  test.slow();
  const email = unique(testInfo, 'invite');
  await inviteAs(context, testInfo, email);

  const invite = await waitForEmail(email, /invited to join Demo A Academy/);
  expect(invite.link).toMatch(/^http:\/\/demo-a\.localhost:3000\/invite\/[\w-]{20,}$/);
  await page.goto(invite.link);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Join Demo A Academy');
  await expect(page.getByText('as Teacher')).toBeVisible();
  await page.getByLabel('Your full name').fill('Esha Teacher');
  await page.getByLabel('Create a password').fill('short');
  await page.getByRole('button', { name: 'Accept and join' }).click();
  await expect(page.getByText('Use at least 8 characters.')).toBeVisible();
  await page.getByLabel('Create a password').fill('Garden-Tiger#2026');
  await page.getByRole('button', { name: 'Accept and join' }).click();
  await expect(page).toHaveURL(hostUrl(testInfo, 'demo-a', '/teach'));
  await expect(page.getByRole('main').getByText("You're signed in as Esha Teacher.")).toBeVisible();

  // The link is single use.
  await signOut(page, testInfo);
  await page.goto(invite.link);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("This invitation can't be used");

  // Forgot → reset.
  await page.goto(hostUrl(testInfo, 'demo-a', '/login'));
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();
  const reset = await waitForEmail(email, /Reset your AcademyBee password/);
  await page.goto(reset.link);
  await page.getByLabel('New password', { exact: true }).fill('River-Lantern#2027');
  await page.getByLabel('Confirm new password').fill('River-Lantern#2028');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText("The passwords don't match.")).toBeVisible();
  await page.getByLabel('Confirm new password').fill('River-Lantern#2027');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('Password changed')).toBeVisible();
  await waitForEmail(email, /password was changed/);

  await page.getByRole('link', { name: 'Sign in' }).click();
  await signIn(page, email, 'Garden-Tiger#2026');
  await expect(formAlert(page)).toContainText("doesn't match");
  await signIn(page, email, 'River-Lantern#2027');
  await expect(page).toHaveURL(hostUrl(testInfo, 'demo-a', '/teach'));

  // The reset link worked once.
  await page.goto(reset.link);
  await page.getByLabel('New password', { exact: true }).fill('Third-Pass#2029');
  await page.getByLabel('Confirm new password').fill('Third-Pass#2029');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText("This link doesn't work any more")).toBeVisible();
});

test('forgot password answers the same for an unknown email', async ({ page }, testInfo) => {
  await page.goto(hostUrl(testInfo, 'demo-a', '/forgot-password'));
  await page.getByLabel('Email', { exact: true }).fill(unique(testInfo, 'unknown'));
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();
});

test('a broken invite or reset link explains what to do next', async ({ page }, testInfo) => {
  await page.goto(hostUrl(testInfo, 'demo-a', '/invite/not-a-real-invitation-token-123'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("This invitation can't be used");
  await page.goto(hostUrl(testInfo, 'demo-a', '/reset-password/x'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    "This link doesn't work any more",
  );
  await expect(page.getByRole('link', { name: 'Get a new link' })).toBeVisible();
});
