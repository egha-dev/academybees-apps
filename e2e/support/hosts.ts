import { expect, type TestInfo } from '@playwright/test';

import { asMigrator } from './db.js';

/** URL on a subdomain of the project's base host, e.g. `http://demo-a.localhost:3000/x`. */
export function hostUrl(testInfo: TestInfo, subdomain: string | null, path = '/'): string {
  const base = new URL(String(testInfo.project.use.baseURL));
  if (subdomain) base.hostname = `${subdomain}.${base.hostname}`;
  return new URL(path, base).toString();
}

/** Seeded academies (`pnpm db:seed`, C-54) — fixed IDs from packages/database/src/seed/tenants.ts. */
export const DEMO_B_ID = '01a0f76f-f745-76ee-8122-37ac4c53af4c';

/** Fail with a clear next step when the E2E database was not seeded. */
export async function requireSeededAcademies(): Promise<void> {
  const count = await asMigrator(async (db) => {
    await db.query('BEGIN');
    try {
      await db.query(`SELECT set_config('app.lookup_host', 'demo-a', true)`);
      const { rows } = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM tenant_domain WHERE hostname = 'demo-a'`,
      );
      return rows[0]?.n ?? 0;
    } finally {
      await db.query('ROLLBACK');
    }
  });
  expect(count, 'Seed the E2E database first: APP_ENV=ci pnpm db:seed').toBe(1);
}
