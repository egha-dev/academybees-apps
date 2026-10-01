import { expect, test } from '@playwright/test';

import { asMigrator } from '../support/db.js';

const OVERRIDE_ID = '0199a0a0-0000-7000-8000-0000000e2e01';

/** ADR-041 exit gate: a release flag hides an unfinished screen, and turning it on shows it. */
test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  await asMigrator((db) =>
    db.query('DELETE FROM feature_flag_override WHERE id = $1', [OVERRIDE_ID]),
  );
});

test('/flag-probe is hidden while p0-flag-probe is off', async ({ page }) => {
  const res = await page.goto('/flag-probe');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('/flag-probe appears when the flag is turned on, and hides again when it is off', async ({
  page,
}) => {
  await asMigrator(async (db) => {
    await db.query(
      `INSERT INTO feature_flag (key, description, owner, expires_on, updated_at)
       VALUES ('p0-flag-probe', 'probe', 'PO', '2026-12-31', now()) ON CONFLICT (key) DO NOTHING`,
    );
    await db.query(
      `INSERT INTO feature_flag_override (id, flag_key, environment, tenant_id, enabled, reason, updated_at)
       VALUES ($1, 'p0-flag-probe', NULL, NULL, true, 'e2e', now())`,
      [OVERRIDE_ID],
    );
  });
  const on = await page.goto('/flag-probe');
  expect(on?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Release flag probe' })).toBeVisible();

  await asMigrator((db) =>
    db.query('DELETE FROM feature_flag_override WHERE id = $1', [OVERRIDE_ID]),
  );
  const off = await page.goto('/flag-probe');
  expect(off?.status()).toBe(404);
});
