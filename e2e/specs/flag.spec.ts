import { expect, test } from '@playwright/test';

import { asMigrator } from '../support/db.js';
import { DEMO_B_ID, hostUrl, requireSeededAcademies } from '../support/hosts.js';

const OVERRIDE_ID = '0199a0a0-0000-7000-8000-0000000e2e01';

/**
 * ADR-041: a release flag hides unfinished work. `p1-tenant-home` is turned off for demo-b only
 * (a per-tenant override, written under demo-b's RLS context) so parallel specs are unaffected.
 */
test.describe.configure({ mode: 'serial' });
test.beforeAll(requireSeededAcademies);

async function setOverride(enabled: boolean | null) {
  await asMigrator(async (db) => {
    // The definition normally comes from `pnpm db:seed`; make the spec independent of it.
    await db.query(
      `INSERT INTO feature_flag (key, description, owner, expires_on, updated_at)
       VALUES ('p1-tenant-home', 'e2e', 'PO', '2027-01-31', now()) ON CONFLICT (key) DO NOTHING`,
    );
    await db.query('BEGIN');
    await db.query(`SELECT set_config('app.tenant_id', $1, true)`, [DEMO_B_ID]);
    await db.query('DELETE FROM feature_flag_override WHERE id = $1', [OVERRIDE_ID]);
    if (enabled !== null)
      await db.query(
        `INSERT INTO feature_flag_override (id, flag_key, environment, tenant_id, enabled, reason, updated_at)
         VALUES ($1, 'p1-tenant-home', NULL, $2, $3, 'e2e', now())`,
        [OVERRIDE_ID, DEMO_B_ID, enabled],
      );
    await db.query('COMMIT');
  });
}

test.afterAll(() => setOverride(null));

test('the academy home is visible while p1-tenant-home is on', async ({ page }, testInfo) => {
  await page.goto(hostUrl(testInfo, 'demo-b'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Welcome to Demo B Dance Studio',
  );
});

test('turning the flag off for one academy hides the unfinished home', async ({
  page,
}, testInfo) => {
  await setOverride(false);
  await page.goto(hostUrl(testInfo, 'demo-b'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Demo B Dance Studio on AcademyBee',
  );
  await expect(page.getByText('Staff sign-in arrives')).toHaveCount(0);
  await page.goto(hostUrl(testInfo, 'demo-a'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome to Demo A Academy');
});
