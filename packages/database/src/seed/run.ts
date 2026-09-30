// pnpm db:seed — local/CI demo data. Refuses to run anywhere else (APP_ENV guard).
import { createMigratorClient } from '../clients.js';
import { requireEnv } from '../cli/env.js';
import { syncFeatureFlagDefinitions } from './flags.js';
import { assertSeedAllowed, SeedNotAllowedError } from './guard.js';

try {
  assertSeedAllowed(process.env.APP_ENV);
} catch (error) {
  if (error instanceof SeedNotAllowedError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

const db = createMigratorClient(requireEnv('MIGRATOR_DATABASE_URL'));
try {
  const flags = await syncFeatureFlagDefinitions(db);
  // Phase 1 adds tenants demo-a, demo-b and paused; Phase 2 one user per role.
  console.warn(`Seeded: ${flags} feature flag definition(s).`);
} finally {
  await db.$disconnect();
}
