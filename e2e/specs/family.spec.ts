import { expect, type Page, type TestInfo, test } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';
import { ownClientIp } from '../support/client-ip.js';
import { asMigrator } from '../support/db.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';
import { waitForEmail } from '../support/mail.js';
import { signInAt } from '../support/session.js';

/**
 * The academy side of the Family Hub (G-06, G-31; C-102, C-107): invite a parent from Student 360
 * (the email arrives), the Parent app poster, the public privacy notice, and approving a join
 * request. The hub's own screens arrive in 7P; the join request is written straight to the
 * database here because the hub API allows each person 5 requests a day (its rules are covered
 * by family.int.spec.ts). Sign-ins are shared between the owner and the admin (5 a minute each).
 */
test.beforeAll(requireSeededAcademies);
test.beforeEach(({ context }) => ownClientIp(context));

const DEMO_A_ID = '01a0f76f-f6b7-7509-a8c2-25059adb97fb';

/** A UUIDv7, as the API generates and requires for ids. */
function uuidv7(): string {
  const hex = Date.now().toString(16).padStart(12, '0') + crypto.randomUUID().replace(/-/g, '');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function csrf(page: Page) {
  return (await page.context().cookies()).find((c) => c.name.endsWith('ab_csrf'))!.value;
}

/** A new student with one parent, created through the API as the signed-in user. */
async function studentWithParent(
  page: Page,
  testInfo: TestInfo,
  name: string,
  parent: { fullName: string; email?: string; phone?: string },
): Promise<string> {
  const res = await page.request.post(hostUrl(testInfo, 'demo-a', '/api/v1/students'), {
    headers: { 'x-csrf-token': await csrf(page), 'idempotency-key': crypto.randomUUID() },
    data: { fullName: name, parent: { parent, isPrimaryContact: true } },
  });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

/** Archive a student this spec created, so repeated runs stay inside the trial's student limit. */
async function archive(page: Page, testInfo: TestInfo, id: string) {
  const url = hostUrl(testInfo, 'demo-a', `/api/v1/students/${id}`);
  const { version } = (await (await page.request.get(url)).json()) as { version: number };
  const res = await page.request.post(`${url}/archive`, {
    headers: { 'x-csrf-token': await csrf(page) },
    data: { version },
  });
  expect(res.status()).toBeLessThan(300);
}

test('a parent is invited to the Family Hub from Student 360 and the email arrives', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const tag = `${Date.now().toString(36)}${testInfo.project.name.length}`;
  const email = `hub-${tag}@family.test`;
  await signInAt(page, testInfo, 'demo-a', 'owner@demo-a.test');
  const id = await studentWithParent(page, testInfo, `Invite Child ${tag}`, {
    fullName: 'Lakshmi Rao',
    email,
  });
  await page.goto(hostUrl(testInfo, 'demo-a', `/students/${id}`));
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Not on the Family Hub yet').first()).toBeVisible();
  await expect(async () => {
    await page.getByRole('button', { name: 'Invite to the Family Hub' }).click();
    await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
  const mail = await waitForEmail(email, /invites you to the AcademyBee Family Hub/);
  expect(mail.text).toContain('Lakshmi Rao');
  expect(mail.link).toMatch(/\/\/app\.[^/]+\/invite#token=/);
  await page.reload();
  await expect(page.getByText(/link open until/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send the invitation again' })).toBeVisible();
  await archive(page, testInfo, id);
});

test('Settings shows the Parent app poster and the privacy notice; sign-in links to it', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await signInAt(page, testInfo, 'demo-a', 'admin@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/settings/parent-app'));
  await expect(page.getByRole('heading', { name: /Join .* on AcademyBee/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /QR code to join/ })).toBeVisible();
  await expect(page.getByText(/\/join\/demo-a/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print poster' })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.goto(hostUrl(testInfo, 'demo-a', '/settings/privacy'));
  await expect(page.getByRole('link', { name: 'Open the public page' })).toBeVisible();
  await expect(page.getByText(/^Version /).first()).toBeVisible();

  // The public page needs no sign-in, and the academy sign-in links to it.
  await page.context().clearCookies();
  await page.goto(hostUrl(testInfo, 'demo-a', '/login'));
  await page.getByRole('link', { name: 'Privacy notice' }).click();
  await expect(page).toHaveURL(hostUrl(testInfo, 'demo-a', '/privacy'));
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy notice' })).toBeVisible();
  await expectNoA11yViolations(page);
});

test('a join request is approved by choosing the child, and leaves the queue', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'one run is enough: it writes data');
  test.setTimeout(90_000);
  const tag = Date.now().toString(36);
  const email = `join-${tag}@family.test`;
  const userId = uuidv7();
  await asMigrator(async (db) => {
    await db.query('BEGIN');
    await db.query(`SELECT set_config('app.lookup_identifier', $1, true)`, [email]);
    await db.query(
      `INSERT INTO "user" (id, email, name, email_verified_at, updated_at)
       VALUES ($1, $2, 'Meena Pillai', now(), now())`,
      [userId, email],
    );
    await db.query(`SELECT set_config('app.tenant_id', $1, true)`, [DEMO_A_ID]);
    await db.query(
      `INSERT INTO join_request (id, tenant_id, user_id, parent_name, email, child_name, updated_at)
       VALUES ($1, $2, $3, 'Meena Pillai', $4, $5, now())`,
      [uuidv7(), DEMO_A_ID, userId, email, `Join Child ${tag}`],
    );
    await db.query('COMMIT');
  });

  await signInAt(page, testInfo, 'demo-a', 'admin@demo-a.test');
  const id = await studentWithParent(page, testInfo, `Join Child ${tag}`, {
    fullName: 'Other Guardian',
  });
  await page.goto(hostUrl(testInfo, 'demo-a', '/join-requests'));
  await expect(page.getByRole('heading', { level: 1, name: 'Join requests' })).toBeVisible();
  const card = page.getByRole('listitem').filter({ hasText: `Join Child ${tag}` });
  await expect(card).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(async () => {
    await card.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('checkbox', { name: `Join Child ${tag}` }).check();
  await sheet.getByRole('button', { name: 'Approve and link' }).click();
  await expect(page.getByText('Meena Pillai linked.')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expectNoA11yViolations(page);
  await archive(page, testInfo, id);
});
