import { expect, test } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';
import { ownClientIp } from '../support/client-ip.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';
import { signInAt } from '../support/session.js';

/**
 * Settings → Academy and Branding & address (UX v1.1 §6; C-49, C-97): the owner uploads a logo
 * (stored in the local S3 store, served from its public URL) and sees it in the shell and on the
 * sign-in page; an unreadable brand colour can't be saved; an admin can look but not change.
 * Desktop only: these change demo-a's shared branding (and restore it).
 */
test.beforeAll(requireSeededAcademies);
test.beforeEach(({ context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Changes shared demo branding; run once');
  return ownClientIp(context);
});
test.describe.configure({ mode: 'serial' });

/** A real 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test('the owner uploads a logo; it shows in the shell and on sign-in; then removes it', async ({
  page,
  browser,
}, testInfo) => {
  await signInAt(page, testInfo, 'demo-a', 'owner@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/settings/branding'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Branding & address');
  await expect(page.getByTestId('academy-address')).toHaveText(
    hostUrl(testInfo, 'demo-a').replace(/\/$/, ''),
  );
  await expectNoA11yViolations(page);

  await page
    .getByTestId('logo-file')
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText('Logo updated')).toBeVisible();
  const logo = page.getByRole('img', { name: 'Current logo' });
  await expect(logo).toBeVisible();
  const src = await logo.getAttribute('src');
  expect(src).toMatch(
    /^http:\/\/localhost:8333\/academybee-local\/t\/[0-9a-f-]{36}\/branding\/[0-9a-f-]{36}\.png$/,
  );
  expect((await page.request.get(src!)).status()).toBe(200);
  // The shell shows the logo instead of the initials.
  await expect(
    page.locator(`header img[src="${src}"], nav img[src="${src}"]`).first(),
  ).toBeAttached();

  // Signed out, the academy's sign-in page shows it too.
  const anon = await browser.newContext();
  await ownClientIp(anon);
  const login = await anon.newPage();
  await login.goto(hostUrl(testInfo, 'demo-a', '/login'));
  await expect(login.locator(`img[src="${src}"]`)).toBeAttached();
  await anon.close();

  await page.getByRole('button', { name: 'Remove logo' }).click();
  await expect(page.getByText('Logo removed')).toBeVisible();
  await expect(
    page.getByText("No logo yet: your academy's initials are shown instead."),
  ).toBeVisible();
});

test('a brand colour that makes text unreadable cannot be saved', async ({ page }, testInfo) => {
  await signInAt(page, testInfo, 'demo-a', 'owner@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/settings/branding'));
  const hex = page.getByLabel('Colour code');
  await hex.fill('#7A7A7A');
  await expect(
    page.getByText("Text isn't readable on this colour. Choose a darker or lighter shade."),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save colour' })).toBeDisabled();
  await hex.fill('#2F4E8C');
  await expect(
    page.getByText('Readable: text on this colour meets the contrast standard.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save colour' })).toBeEnabled();
});

test('Settings → Academy: the owner edits; an admin only reads', async ({
  page,
  browser,
}, testInfo) => {
  await signInAt(page, testInfo, 'demo-a', 'owner@demo-a.test');
  await page.getByRole('link', { name: 'Settings' }).first().click();
  await expect(page).toHaveURL(hostUrl(testInfo, 'demo-a', '/settings/academy'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Academy');
  await expectNoA11yViolations(page);
  await page.getByLabel('Phone').fill('98400 11111');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Academy details saved')).toBeVisible();
  await expect(page.getByLabel('Phone')).toHaveValue('+919840011111');
  await page.getByRole('link', { name: 'Branding & address' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Branding & address');

  const ctx = await browser.newContext();
  await ownClientIp(ctx);
  const admin = await ctx.newPage();
  await signInAt(admin, testInfo, 'demo-a', 'admin@demo-a.test');
  await admin.goto(hostUrl(testInfo, 'demo-a', '/settings/branding'));
  await expect(
    admin.getByText("You can see your academy's branding. Only the owner can change it."),
  ).toBeVisible();
  await expect(admin.getByRole('button', { name: /Upload logo|Save colour/ })).toHaveCount(0);
  await ctx.close();
});

test('the settings pages have no WCAG 2.1 AA violations in dark mode', async ({
  browser,
}, testInfo) => {
  const ctx = await browser.newContext({ colorScheme: 'dark' });
  await ownClientIp(ctx);
  const page = await ctx.newPage();
  await signInAt(page, testInfo, 'demo-a', 'owner@demo-a.test');
  for (const path of ['/settings/academy', '/settings/branding']) {
    await page.goto(hostUrl(testInfo, 'demo-a', path));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoA11yViolations(page);
  }
  await ctx.close();
});
