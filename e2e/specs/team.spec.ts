import { expect, type Page, test, type TestInfo } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';
import { ownClientIp } from '../support/client-ip.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';
import { acceptViaApi, inviteViaApi, signIn, signInAt } from '../support/session.js';

/**
 * Phase 2 signed-in shell and Team (plan 2.17, 2.18; UX §8, §23, §25): navigation shows only
 * built modules the role may open; owners invite, resend and revoke, change roles and disable
 * access; roles without `team.read` get a permission state. Phone and desktop layouts.
 */
test.beforeAll(requireSeededAcademies);
test.beforeEach(({ context }) => ownClientIp(context));

const unique = (testInfo: TestInfo, label: string) =>
  `e2e-${label}-${testInfo.project.name}-${Date.now()}@example.test`;

const isPhone = (testInfo: TestInfo) => testInfo.project.name !== 'desktop-chromium';

/** Open Team the way a person would: the sidebar on wide screens, More on phones. */
async function openTeam(page: Page, testInfo: TestInfo) {
  if (isPhone(testInfo)) {
    await page.getByRole('navigation').getByRole('link', { name: 'More' }).click();
    await page.getByRole('main').getByRole('link', { name: 'Team' }).click();
  } else {
    await page.getByRole('navigation').getByRole('link', { name: 'Team' }).click();
  }
  await expect(page).toHaveURL(hostUrl(testInfo, 'demo-a', '/settings/team'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Team');
}

/** The open sheet (a side drawer on desktop, a bottom sheet on phones). */
const sheet = (page: Page) =>
  page.getByRole('presentation').filter({ has: page.getByRole('heading') });

test('the owner finds Team in the navigation and sees themself in the list', async ({
  page,
}, testInfo) => {
  await signInAt(page, testInfo, 'demo-a', 'owner@demo-a.test');
  await openTeam(page, testInfo);
  const me = page.getByRole('listitem').filter({ hasText: 'Asha Owner' });
  await expect(me.getByText('You', { exact: true })).toBeVisible();
  await expect(me.getByText('Owner', { exact: true })).toBeVisible();
  // Nobody manages their own access.
  await expect(me.getByRole('button', { name: 'Manage' })).toHaveCount(0);
});

test('invite, resend and revoke an invitation', async ({ page }, testInfo) => {
  const email = unique(testInfo, 'team-invite');
  await signInAt(page, testInfo, 'demo-a', 'owner@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/settings/team'));

  await page.getByRole('button', { name: 'Invite member' }).first().click();
  const form = sheet(page);
  await expect(form.getByRole('heading', { name: 'Invite a team member' })).toBeVisible();
  await form.getByRole('button', { name: 'Send invitation' }).click();
  await expect(form.getByText('Enter this to continue.')).toHaveCount(2);
  await form.getByLabel('Email').fill(email);
  await form.getByRole('checkbox', { name: 'Teacher' }).check();
  await form.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible();

  const row = page.getByRole('listitem').filter({ hasText: email });
  await expect(row.getByText('Pending')).toBeVisible();
  await row.getByRole('button', { name: 'Resend' }).click();
  await expect(page.getByText(`Invitation sent again to ${email}`)).toBeVisible();

  await row.getByRole('button', { name: 'Revoke' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke' }).click();
  await expect(page.getByText('Invitation revoked')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: email })).toHaveCount(0);
});

test('change a member’s roles, then disable their access', async ({ page, context }, testInfo) => {
  test.slow();
  const email = unique(testInfo, 'team-member');
  await inviteViaApi(context, testInfo, email, ['teacher']);
  await acceptViaApi(context, testInfo, email, 'Mira Member', 'Quiet-Harbour#2026');

  await signInAt(page, testInfo, 'demo-a', 'owner@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/settings/team'));
  let row = page.getByRole('listitem').filter({ hasText: email });
  await row.getByRole('button', { name: 'Manage' }).click();
  let form = sheet(page);
  await form.getByRole('checkbox', { name: 'Teacher' }).uncheck();
  await form.getByRole('checkbox', { name: 'Receptionist' }).check();
  await form.getByRole('button', { name: 'Save roles' }).click();
  await expect(page.getByText('Roles updated')).toBeVisible();
  row = page.getByRole('listitem').filter({ hasText: email });
  await expect(row.getByText('Receptionist')).toBeVisible();

  await row.getByRole('button', { name: 'Manage' }).click();
  form = sheet(page);
  await form.getByRole('button', { name: 'Disable access' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Disable access' }).click();
  await expect(page.getByText('Access disabled')).toBeVisible();
  await expect(
    page.getByRole('listitem').filter({ hasText: email }).getByText('Disabled'),
  ).toBeVisible();

  // The disabled member can no longer sign in here.
  await context.clearCookies();
  await page.goto(hostUrl(testInfo, 'demo-a', '/login'));
  await signIn(page, email, 'Quiet-Harbour#2026');
  await expect(page.getByRole('main').getByRole('alert')).toContainText("doesn't match");
});

test('a role without team access gets a permission state, and no Team link', async ({
  page,
}, testInfo) => {
  await signInAt(page, testInfo, 'demo-a', 'accountant@demo-a.test');
  await expect(page.getByRole('link', { name: 'Team' })).toHaveCount(0);
  await page.goto(hostUrl(testInfo, 'demo-a', '/settings/team'));
  await expect(page.getByRole('heading', { name: "You can't view the team" })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to your home page' })).toBeVisible();
});

test('a teacher stays in the Teacher experience', async ({ page }, testInfo) => {
  await signInAt(page, testInfo, 'demo-a', 'teacher@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/settings/team'));
  await expect(page).toHaveURL(hostUrl(testInfo, 'demo-a', '/teach'));
});

for (const theme of ['light', 'dark'] as const) {
  test(`the Team page has no WCAG 2.1 AA violations (${theme})`, async ({ browser }, testInfo) => {
    test.skip(isPhone(testInfo), 'Checked once on desktop; the phone layout is covered above');
    const context = await browser.newContext({ colorScheme: theme });
    await ownClientIp(context);
    const page = await context.newPage();
    await signInAt(page, testInfo, 'demo-a', 'owner@demo-a.test');
    await page.goto(hostUrl(testInfo, 'demo-a', '/settings/team'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Team');
    await expectNoA11yViolations(page);
    await context.close();
  });
}
