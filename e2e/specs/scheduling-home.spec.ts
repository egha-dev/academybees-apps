import { expect, test } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';
import { ownClientIp } from '../support/client-ip.js';
import { asMigrator } from '../support/db.js';
import { DEMO_B_ID, hostUrl, requireSeededAcademies } from '../support/hosts.js';
import { signInAt } from '../support/session.js';

/**
 * Owner Today v1, Teacher home v1 (UX §11.1, §25; C-117) and the academy's own words (ADR-029,
 * C-118). The words test changes demo-b's terminology and puts it back.
 */
test.beforeAll(requireSeededAcademies);
test.beforeEach(({ context }) => ownClientIp(context));

test('Owner Today: the academy’s day, today’s classes and what needs attention', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await signInAt(page, testInfo, 'demo-a', 'admin@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/today'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today at Demo A Academy');
  await expect(page.getByRole('heading', { name: "Today's batches" })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
  await expectNoA11yViolations(page);
});

test('Teacher home: today, the next 7 days and their own batches, attendance explained', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await signInAt(page, testInfo, 'demo-a', 'teacher@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/teach'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Hello, /);
  await expect(page.getByRole('heading', { name: 'Next 7 days' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'My batches' })).toBeVisible();
  await expectNoA11yViolations(page);
});

test('the academy’s words: Batch → Class, Teacher → Coach, everywhere', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'changes demo-b settings; run once');
  test.setTimeout(150_000);
  // Put demo-b's words back exactly as they were.
  const terminology = (value?: unknown) =>
    asMigrator(async (db) => {
      await db.query('BEGIN');
      await db.query(`SELECT set_config('app.tenant_id', $1, true)`, [DEMO_B_ID]);
      const { rows } = await db.query<{ terminology: unknown }>(
        value === undefined
          ? 'SELECT terminology FROM tenant_settings'
          : 'UPDATE tenant_settings SET terminology = $1 RETURNING terminology',
        value === undefined ? [] : [JSON.stringify(value)],
      );
      await db.query('COMMIT');
      return rows[0]?.terminology;
    });
  const original = await terminology();
  const reset = () => terminology(original);
  try {
    await signInAt(page, testInfo, 'demo-b', 'owner@demo-b.test');
    await page.goto(hostUrl(testInfo, 'demo-b', '/settings/academy'));
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Words your academy uses' })).toBeVisible();
    await page.getByLabel('A group that meets together').selectOption('group');
    await page.getByLabel('Who teaches').selectOption('coach');
    await page.getByRole('button', { name: 'Save words' }).click();
    await expect(page.getByText('Saved. Every screen now uses these words.')).toBeVisible();
    // The academy context is cached for up to a minute; then Today says "groups" (its classes, or
    // the empty state when demo-b has none yet).
    await expect(async () => {
      await page.goto(hostUrl(testInfo, 'demo-b', '/today'));
      await expect(page.getByText(/Today's groups|No groups yet/)).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 90_000, intervals: [5_000] });
  } finally {
    await reset();
  }
});
