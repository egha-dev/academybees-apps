import { expect, type Page, test } from '@playwright/test';

import { ownClientIp } from '../support/client-ip.js';
import { asMigrator } from '../support/db.js';
import { DEMO_B_ID, hostUrl, requireSeededAcademies } from '../support/hosts.js';

const OVERRIDE_ID = '0199a0a0-0000-7000-8000-0000000e2e01';
const FLAG = 'p2-role-homes';

/**
 * ADR-041: a release flag hides unfinished work. `p2-role-homes` (the signed-in landing until the
 * real homes ship) is turned off for demo-b only — a per-tenant override written under demo-b's
 * RLS context — so parallel specs on demo-a are unaffected.
 */
test.describe.configure({ mode: 'serial' });
test.beforeAll(requireSeededAcademies);
test.beforeEach(({ context }) => ownClientIp(context));

async function setOverride(enabled: boolean | null) {
  await asMigrator(async (db) => {
    // The definition normally comes from `pnpm db:seed`; make the spec independent of it.
    await db.query(
      `INSERT INTO feature_flag (key, description, owner, expires_on, updated_at)
       VALUES ($1, 'e2e', 'PO', '2027-03-31', now()) ON CONFLICT (key) DO NOTHING`,
      [FLAG],
    );
    await db.query('BEGIN');
    await db.query(`SELECT set_config('app.tenant_id', $1, true)`, [DEMO_B_ID]);
    await db.query('DELETE FROM feature_flag_override WHERE id = $1', [OVERRIDE_ID]);
    if (enabled !== null)
      await db.query(
        `INSERT INTO feature_flag_override (id, flag_key, environment, tenant_id, enabled, reason, updated_at)
         VALUES ($1, $2, NULL, $3, $4, 'e2e', now())`,
        [OVERRIDE_ID, FLAG, DEMO_B_ID, enabled],
      );
    await db.query('COMMIT');
  });
}

test.afterAll(() => setOverride(null));

async function signInToDemoB(page: Page, url: string) {
  await page.goto(url);
  await page.getByLabel('Email or mobile number').fill('owner@demo-b.test');
  await page.getByLabel('Password', { exact: true }).fill('AcademyBees#2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('the signed-in landing is visible while p2-role-homes is on', async ({ page }, testInfo) => {
  await signInToDemoB(page, hostUrl(testInfo, 'demo-b', '/login'));
  // An Owner without 2FA is asked first (C-80); the landing is one step away.
  await expect(page).toHaveURL(hostUrl(testInfo, 'demo-b', '/settings/security?prompt=mfa'), {
    timeout: 15_000,
  });
  await page.getByRole('link', { name: 'Not now' }).click();
  await expect(page).toHaveURL(hostUrl(testInfo, 'demo-b', '/today'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Signed in to Demo B Dance Studio',
  );
});

test('turning the flag off for one academy hides the unfinished page', async ({
  page,
}, testInfo) => {
  await setOverride(false);
  await signInToDemoB(page, hostUrl(testInfo, 'demo-b', '/login'));
  await expect(page).toHaveURL(/\/settings\/security/, { timeout: 15_000 });
  // Without the role homes, staff land on their (real) Security page, with no "Not now" link to
  // a home that isn't there (C-68, C-80).
  await page.goto(hostUrl(testInfo, 'demo-b', '/today'));
  await expect(page).toHaveURL(hostUrl(testInfo, 'demo-b', '/settings/security'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Security');
  await expect(page.getByRole('link', { name: 'Not now' })).toHaveCount(0);
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Today' })).toHaveCount(0);
});
