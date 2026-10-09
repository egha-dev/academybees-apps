import { expect, test } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';
import { ownClientIp } from '../support/client-ip.js';
import { asMigrator } from '../support/db.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';
import { signIn } from '../support/session.js';

/**
 * Guided setup on a phone (UX v1.1 §4–5, C-85; `p3-onboarding` on in ci): the owner of the
 * setting-up demo academy signs in, accepts the legal documents, is welcomed, and goes through
 * every step to Ready — resuming on another device half-way. It stops short of opening the academy
 * so the seeded academy stays in setup (the provisioning journey opens a fresh one, S8).
 */
test.beforeAll(requireSeededAcademies);
test.beforeEach(({ context }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'android-chromium',
    'Phone-first; one project (shared academy)',
  );
  return ownClientIp(context);
});
test.describe.configure({ mode: 'serial' });

const SETUP_ID = '01a0f76f-f862-774a-8a43-f2f8959ae247';
const OWNER = 'owner@setup-demo.test';
const OWNER_ID = '01a0fcde-80a1-7c4e-9b3a-5d2f8e6a1c01';

/** Start every run from a fresh setup: nothing accepted, nothing saved. */
async function resetSetup() {
  await asMigrator(async (db) => {
    await db.query('BEGIN');
    await db.query(`SELECT set_config('app.tenant_id', $1, true)`, [SETUP_ID]);
    await db.query(
      `UPDATE tenant_onboarding SET steps = '{}', current_step = 'profile', completed_at = NULL, version = version + 1`,
    );
    await db.query(`UPDATE tenant SET status = 'SETUP' WHERE id = $1`, [SETUP_ID]);
    // Acceptances are user-owned (C-59 RLS): delete them as their user.
    await db.query(`SELECT set_config('app.user_id', $1, true)`, [OWNER_ID]);
    await db.query(`DELETE FROM legal_acceptance WHERE user_id = $1`, [OWNER_ID]);
    await db.query('COMMIT');
  });
}

test('the owner accepts the terms, is welcomed and sets up the academy step by step', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  await resetSetup();
  const url = (path: string) => hostUrl(testInfo, 'setup-demo', path);

  // Visitors see that the academy is getting ready, with a way in for its owner.
  await page.goto(url('/'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Setup Music School is getting ready',
  );
  await page.getByRole('link', { name: 'I run this academy — sign in' }).click();
  await signIn(page, OWNER);

  // Legal first (ADR-034) — after sign-in, the gate and Welcome send the owner here.
  await expect(page).toHaveURL(url('/legal'), { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Finish later' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Before you start');
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Accept and continue' }).click();
  await expect(page.getByText('Tick the box to accept the documents.')).toBeVisible();
  await page.getByLabel(/I have read and accept these documents/).check();
  await page.getByRole('button', { name: 'Accept and continue' }).click();

  // Welcome (UX v1.1 §4).
  await expect(page).toHaveURL(url('/welcome'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome to Setup Music School');
  await expectNoA11yViolations(page);
  await page.getByRole('link', { name: 'Start setup' }).click();

  // Profile and Type can't be skipped.
  await expect(page).toHaveURL(url('/onboarding/profile'));
  await expect(page.getByRole('button', { name: 'Skip for now' })).toHaveCount(0);
  await page.getByLabel('Phone').fill('98400 22222');
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page).toHaveURL(url('/onboarding/type'));
  await page.getByRole('radio', { name: /Music/ }).check();
  await page.getByRole('button', { name: 'Save and continue' }).click();

  // The academy's own words from here on (music → "class").
  await expect(page).toHaveURL(url('/onboarding/course'));
  await page.getByRole('textbox', { name: /^Name/ }).fill('Carnatic vocal');
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page).toHaveURL(url('/onboarding/teacher'));
  await expect(page.getByText('The person who takes this class.', { exact: false })).toBeVisible();
  await page.getByRole('radio', { name: 'I teach it myself' }).check();
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page).toHaveURL(url('/onboarding/batch'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your first class');

  // Half-way: another device resumes exactly here.
  const other = await browser.newContext();
  await ownClientIp(other);
  const second = await other.newPage();
  await second.goto(url('/login'));
  await signIn(second, OWNER);
  await second.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 });
  await second.waitForLoadState('networkidle');
  await second.goto(url('/welcome'));
  await expect(second.getByText('4 of 7 steps done')).toBeVisible();
  await second.getByRole('link', { name: 'Continue setup' }).click();
  await expect(second).toHaveURL(url('/onboarding/batch'));
  await other.close();

  await page.getByRole('textbox', { name: /^Name/ }).fill('Evening juniors');
  await page.getByLabel('Maximum students (optional)').fill('12');
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page).toHaveURL(url('/onboarding/students'));
  await page.getByLabel("Student's name").fill('Ananya');
  await page.getByLabel("Parent's mobile (optional)").fill('12345');
  await page.getByRole('button', { name: 'Add another student' }).click();
  await page.getByLabel("Student's name").nth(1).fill('Kabir');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  // A wrong mobile number is explained on its field.
  await expect(page.getByText('Check the highlighted fields.')).toBeVisible();
  await page.getByLabel("Parent's mobile (optional)").first().fill('9840033333');
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page).toHaveURL(url('/onboarding/timetable'));
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Save and continue' }).click();

  // Ready: what was set up, and the next classes.
  await expect(page).toHaveURL(url('/onboarding/ready'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Setup Music School is ready');
  await expect(page.getByRole('list', { name: 'Setup progress' }).getByText('Done')).toHaveCount(7);
  await expect(page.getByRole('heading', { name: 'Next classes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open my academy' })).toBeEnabled();
  await expectNoA11yViolations(page);

  // Going back shows what was entered (and saving again edits, never duplicates).
  await page.getByRole('link', { name: 'First students' }).click();
  await expect(page.getByLabel("Student's name").first()).toHaveValue('Ananya');
  await expect(page.getByText('Admission number ADM-', { exact: false }).first()).toBeVisible();
});

test('the setup screens have no WCAG 2.1 AA violations in dark mode', async ({
  browser,
}, testInfo) => {
  const ctx = await browser.newContext({ colorScheme: 'dark' });
  await ownClientIp(ctx);
  const page = await ctx.newPage();
  await page.goto(hostUrl(testInfo, 'setup-demo', '/login'));
  await signIn(page, OWNER);
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  for (const path of [
    '/welcome',
    '/onboarding/type',
    '/onboarding/students',
    '/onboarding/ready',
  ]) {
    await page.goto(hostUrl(testInfo, 'setup-demo', path));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoA11yViolations(page);
  }
  await ctx.close();
  await resetSetup();
});
