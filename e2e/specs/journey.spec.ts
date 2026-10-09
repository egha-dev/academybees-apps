import { expect, type Page, test, type TestInfo } from '@playwright/test';

import { ownClientIp } from '../support/client-ip.js';
import { signInNewConsoleAdmin } from '../support/console.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';
import { waitForEmail } from '../support/mail.js';

/**
 * Phase 3 critical journey (IMPLEMENTATION_PLAN Phase 3 tests; EXECUTION_GUIDE Phase 3):
 * a Super Admin creates "Gurushethra" in the console → the success screen shows its address →
 * the owner accepts the emailed invitation → accepts the terms → is welcomed → completes every
 * setup step → opens the academy (ACTIVE) → the console suspends it (the academy shows its
 * unavailable page) → reactivates it → changes its address (the old one redirects).
 */
test.beforeAll(requireSeededAcademies);
test.beforeEach(({ context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One end-to-end journey (desktop)');
  return ownClientIp(context);
});

const OWNER_PASSWORD = 'Lotus-Ankle#2026';

async function save(page: Page) {
  await page.getByRole('button', { name: 'Save and continue' }).click();
}

async function contextStatus(page: Page, testInfo: TestInfo, slug: string): Promise<string> {
  const res = await page.request.get(hostUrl(testInfo, slug, '/api/v1/tenant/context'));
  return ((await res.json()) as { status: string }).status;
}

test('create an academy in the console, onboard its owner, open it, suspend, reactivate, move it', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const tag = `${Date.now()}`.slice(-6);
  const slug = `gurushethra-${tag}`;
  const ownerEmail = `owner-${slug}@example.test`;
  const consoleUrl = (path = '/') => hostUrl(testInfo, 'console', path);
  const academyUrl = (path = '/') => hostUrl(testInfo, slug, path);

  // 1. The console creates the academy.
  await signInNewConsoleAdmin(
    page,
    consoleUrl,
    `journey-${tag}@academybees.test`,
    'Saffron#Monsoon2026',
  );
  await page.goto(consoleUrl('/academies/new'));
  const address = page.getByLabel('Address');
  await address.fill('admin');
  await expect(page.getByTestId('slug-status')).toHaveAttribute('data-status', 'reserved');
  await address.fill('www');
  await expect(page.getByTestId('slug-status')).toHaveAttribute('data-status', 'reserved');
  await page.getByLabel('Academy name').fill(`Gurushethra ${tag}`);
  await address.fill(slug);
  await expect(page.getByTestId('slug-status')).toHaveAttribute('data-status', 'available');
  await page.getByLabel('Academy type').click();
  await page.getByRole('option', { name: 'Dance' }).click();
  await page.getByLabel("Owner's name").fill('Lakshmi Raman');
  await page.getByLabel("Owner's email").fill(ownerEmail);
  await page.getByRole('button', { name: 'Create academy' }).click();
  await expect(page.getByTestId('academy-url')).toHaveText(academyUrl().replace(/\/$/, ''));
  await expect(page.getByRole('button', { name: 'Copy address' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open academy' })).toBeVisible();
  const detailUrl = page.url().replace(/\/created$/, '/overview');

  // 2. The owner's invitation arrives; they join and choose a password.
  const owner = await browser.newContext();
  await ownClientIp(owner);
  const o = await owner.newPage();
  const invite = await waitForEmail(
    ownerEmail,
    new RegExp(`Gurushethra ${tag} is ready on AcademyBee`),
  );
  expect(invite.link).toMatch(new RegExp(`^http://${slug}\\.localhost:\\d+/invite#token=`));
  await o.goto(invite.link.replace(/:\d+\//, `:${new URL(academyUrl()).port}/`));
  await expect(o.getByRole('heading', { level: 1 })).toHaveText(`Join Gurushethra ${tag}`);
  await o.getByLabel('Your full name').fill('Lakshmi Raman');
  await o.getByLabel('Create a password').fill(OWNER_PASSWORD);
  await o.getByRole('button', { name: 'Accept and join' }).click();

  // 3. Terms first, then Welcome.
  await expect(o).toHaveURL(academyUrl('/legal'), { timeout: 20_000 });
  await o.getByLabel(/I have read and accept these documents/).check();
  await o.getByRole('button', { name: 'Accept and continue' }).click();
  await expect(o).toHaveURL(academyUrl('/welcome'));
  await expect(o.getByRole('heading', { level: 1 })).toHaveText(`Welcome to Gurushethra ${tag}`);
  await o.getByRole('link', { name: 'Start setup' }).click();

  // 4. Every step (dance → "class").
  await expect(o).toHaveURL(academyUrl('/onboarding/profile'));
  await save(o);
  await expect(o).toHaveURL(academyUrl('/onboarding/type'));
  await expect(o.getByRole('radio', { name: /Dance/ })).toBeChecked();
  await save(o);
  await expect(o).toHaveURL(academyUrl('/onboarding/course'));
  await o.getByRole('textbox', { name: /^Name/ }).fill('Bharatanatyam');
  await save(o);
  await expect(o).toHaveURL(academyUrl('/onboarding/teacher'));
  await o.getByRole('radio', { name: 'I teach it myself' }).check();
  await save(o);
  await expect(o).toHaveURL(academyUrl('/onboarding/batch'));
  await expect(o.getByRole('heading', { level: 1 })).toHaveText('Your first class');
  await o.getByRole('textbox', { name: /^Name/ }).fill('Evening juniors');
  await save(o);
  await expect(o).toHaveURL(academyUrl('/onboarding/students'));
  await o.getByLabel("Student's name").fill('Ananya');
  await o.getByLabel("Parent's mobile (optional)").fill('9840044444');
  await save(o);
  await expect(o).toHaveURL(academyUrl('/onboarding/timetable'));
  await save(o);
  await expect(o).toHaveURL(academyUrl('/onboarding/ready'));
  await expect(o.getByRole('heading', { level: 1 })).toHaveText(`Gurushethra ${tag} is ready`);

  // 5. Open the academy: ACTIVE.
  await o.getByRole('button', { name: 'Open my academy' }).click();
  await o.waitForURL((u) => !u.pathname.startsWith('/onboarding'), { timeout: 20_000 });
  await expect.poll(() => contextStatus(o, testInfo, slug)).toBe('ACTIVE');

  // 6. The console suspends it: the academy shows its unavailable page; reactivate.
  await page.goto(detailUrl);
  await page.getByRole('button', { name: 'Suspend' }).click();
  await page.getByLabel('Reason').fill('Journey check');
  await page.getByRole('button', { name: 'Suspend academy' }).click();
  await expect(page.getByText(`Gurushethra ${tag} is suspended.`)).toBeVisible();
  await o.goto(academyUrl('/today'));
  await expect(o.getByRole('heading', { level: 1 })).toHaveText(
    `Gurushethra ${tag} is temporarily unavailable`,
  );
  await page.getByRole('button', { name: 'Reactivate' }).click();
  await page.getByLabel('Reason').fill('Journey done');
  await page.getByRole('button', { name: 'Reactivate academy' }).click();
  await expect(page.getByText(`Gurushethra ${tag} is open again.`)).toBeVisible();
  await expect.poll(() => contextStatus(o, testInfo, slug)).toBe('ACTIVE');

  // 7. Change the address: the old one redirects to the new one.
  await page.getByRole('link', { name: 'Address' }).click();
  await page.getByRole('button', { name: 'Change address' }).click();
  const moved = `${slug}-arts`;
  await page.getByLabel('New address').fill(moved);
  await expect(page.getByTestId('slug-status')).toHaveAttribute('data-status', 'available');
  await page.getByRole('dialog').getByRole('button', { name: 'Change address' }).click();
  await expect(page.getByTestId('current-address')).toHaveText(
    hostUrl(testInfo, moved).replace(/\/$/, ''),
  );
  const old = await o.request.get(academyUrl('/login'), { maxRedirects: 0 });
  expect(old.status()).toBe(301);
  expect(old.headers().location).toBe(hostUrl(testInfo, moved, '/login'));
  await page.screenshot({
    path: `artifacts/screenshots/journey-console-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await owner.close();
});
