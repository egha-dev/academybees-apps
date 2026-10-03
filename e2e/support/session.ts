import { type BrowserContext, expect, type Page, type TestInfo } from '@playwright/test';

import { hostUrl } from './hosts.js';
import { waitForEmail } from './mail.js';

/** Seeded users (local/ci only): `<role>@demo-a.test`. */
export const DEV_PASSWORD = 'AcademyBees#2026';

export async function signIn(page: Page, identifier: string, password = DEV_PASSWORD) {
  await page.getByLabel('Email or mobile number').fill(identifier);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Sign in on an academy and wait for the home page. */
export async function signInAt(page: Page, testInfo: TestInfo, slug: string, email: string) {
  await page.goto(hostUrl(testInfo, slug, '/login'));
  await signIn(page, email);
  // The home page is server-rendered after the redirect; allow for a busy server under parallel runs.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

/** Sign out from the account panel: the sidebar on wide screens, More on phones (UX §25). */
export async function signOut(page: Page, testInfo: TestInfo, slug = 'demo-a') {
  const inSidebar = page.getByRole('navigation').getByRole('button', { name: 'Sign out' });
  if (!(await inSidebar.isVisible())) await page.goto(hostUrl(testInfo, slug, '/more'));
  await page.getByRole('button', { name: 'Sign out' }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(hostUrl(testInfo, slug, '/login'));
}

/** The owner of demo-a invites someone through the API (as the Team page does). */
export async function inviteViaApi(
  context: BrowserContext,
  testInfo: TestInfo,
  email: string,
  roles: string[] = ['teacher'],
) {
  const login = await context.request.post(hostUrl(testInfo, 'demo-a', '/api/v1/auth/login'), {
    data: { identifier: 'owner@demo-a.test', password: DEV_PASSWORD },
  });
  expect(login.status()).toBe(200);
  const csrf = (await context.cookies()).find((c) => c.name.endsWith('ab_csrf'))!.value;
  const res = await context.request.post(hostUrl(testInfo, 'demo-a', '/api/v1/team/invitations'), {
    headers: { 'x-csrf-token': csrf, 'idempotency-key': crypto.randomUUID() },
    data: { email, roles },
  });
  expect(res.status()).toBe(201);
  await context.clearCookies();
}

/** Accept the emailed invitation as a new person, through the API. */
export async function acceptViaApi(
  context: BrowserContext,
  testInfo: TestInfo,
  email: string,
  name: string,
  password: string,
) {
  const invite = await waitForEmail(email, /invited to join/);
  const token = invite.link.split('/invite/')[1]!;
  const res = await context.request.post(
    hostUrl(testInfo, 'demo-a', `/api/v1/invitations/${token}/accept`),
    { data: { name, password } },
  );
  expect(res.status()).toBe(200);
  await context.clearCookies();
}
