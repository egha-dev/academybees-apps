import { type APIRequestContext, expect, test } from '@playwright/test';

import { ownClientIp } from '../support/client-ip.js';
import { asMigrator } from '../support/db.js';
import { DEMO_B_ID, hostUrl, requireSeededAcademies } from '../support/hosts.js';

const OVERRIDE_ID = '0199a0a0-0000-7000-8000-0000000e2e01';
const FLAG = 'p1-hub-placeholder';

/**
 * ADR-041: release flags resolve per academy. A per-tenant override (written under demo-b's RLS
 * context) turns `p1-hub-placeholder` off for demo-b only; the flags endpoint reflects it there
 * and nowhere else. The Family Hub itself has no academy, so parallel hub specs are unaffected.
 * (`p5-scheduling`, which this spec used before, was removed when Phase 5's screens shipped.)
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

async function flagOn(request: APIRequestContext, url: string) {
  const res = await request.get(url);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { flags: Record<string, boolean> }).flags[FLAG];
}

test('a per-academy override turns a flag off for that academy only', async ({
  request,
}, testInfo) => {
  const demoB = hostUrl(testInfo, 'demo-b', '/api/v1/flags');
  const demoA = hostUrl(testInfo, 'demo-a', '/api/v1/flags');
  expect(await flagOn(request, demoB)).toBe(true);
  await setOverride(false);
  await expect.poll(() => flagOn(request, demoB), { timeout: 15_000 }).toBe(false);
  expect(await flagOn(request, demoA)).toBe(true);
  await setOverride(null);
  await expect.poll(() => flagOn(request, demoB), { timeout: 15_000 }).toBe(true);
});
