import { expect, type Page, test } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';
import { ownClientIp } from '../support/client-ip.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';
import { waitForEmail } from '../support/mail.js';
import { signInAt } from '../support/session.js';

/**
 * Phase 4 exit journey (IMPLEMENTATION_PLAN Phase 4 gate): add a student with two parents from
 * the Students list → Student 360 shows both → invite a parent to the Family Hub → the email
 * arrives. Runs on desktop and on both phones (UX §25: Students sits in the bottom bar). The
 * student is archived at the end so repeated runs stay inside the trial's student limit.
 */
test.beforeAll(requireSeededAcademies);
test.beforeEach(({ context }) => ownClientIp(context));

async function settled(page: Page) {
  await page.waitForLoadState('networkidle');
}

test('add a student with two parents, see both on Student 360, invite one to the Family Hub', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const tag = `${Date.now().toString(36)}${testInfo.project.name.length}`;
  const email = `journey-${tag}@family.test`;
  const owner = testInfo.project.name === 'desktop-chromium' ? 'owner' : 'admin';
  await signInAt(page, testInfo, 'demo-a', `${owner}@demo-a.test`);

  // Students is in the navigation (the bottom bar on phones).
  await page.goto(hostUrl(testInfo, 'demo-a', '/today'));
  await page.getByRole('link', { name: 'Students' }).filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Students' })).toBeVisible();
  await settled(page);

  // Add student with the first parent (mobile and email).
  await page.getByRole('link', { name: 'Add student' }).first().click();
  await settled(page);
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Full name').fill(`Journey ${tag}`);
  await sheet.getByLabel("Parent's name").fill(`Priya ${tag}`);
  await sheet.getByLabel("Parent's mobile").fill(`97${`${Date.now()}`.slice(-6)}22`);
  await sheet.getByLabel("Parent's email (optional)").fill(email);
  await sheet.getByRole('button', { name: 'Add student' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Journey ${tag}` })).toBeVisible({
    timeout: 15_000,
  });
  const studentUrl = page.url();
  await settled(page);

  // The second parent.
  const parents = page.getByRole('region', { name: 'Parents and guardians' });
  await expect(async () => {
    await page.getByRole('button', { name: 'Add parent' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  const add = page.getByRole('dialog');
  await add.getByLabel("Parent's name").fill(`Ramesh ${tag}`);
  await add.getByLabel('Relationship').selectOption('FATHER');
  await add.getByRole('button', { name: 'Add parent' }).click();
  await expect(parents.getByText(`Priya ${tag}`)).toBeVisible();
  await expect(parents.getByText(`Ramesh ${tag}`)).toBeVisible();
  await expect(parents.getByText('Primary contact')).toBeVisible();
  await expectNoA11yViolations(page);

  // Invite the parent with an email address; the one without shows why they can't be invited.
  await expect(parents.getByText('Add an email address to invite them.')).toBeVisible();
  await expect(async () => {
    await parents.getByRole('button', { name: 'Invite to the Family Hub' }).click();
    await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
  const mail = await waitForEmail(email, /invites you to the AcademyBee Family Hub/);
  expect(mail.text).toContain(`Priya ${tag}`);
  expect(mail.text).toContain(`Journey ${tag}`);
  expect(mail.link).toMatch(/\/\/app\.[^/]+\/invite#token=/);

  // Clean up: archive (restorable for 90 days, C-108) through the API.
  const id = new URL(studentUrl).pathname.split('/').pop()!;
  const api = hostUrl(testInfo, 'demo-a', `/api/v1/students/${id}`);
  const { version } = (await (await page.request.get(api)).json()) as { version: number };
  const csrf = (await page.context().cookies()).find((c) => c.name.endsWith('ab_csrf'))!.value;
  const res = await page.request.post(`${api}/archive`, {
    headers: { 'x-csrf-token': csrf },
    data: { version },
  });
  expect(res.status()).toBeLessThan(300);
});
