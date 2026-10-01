// pnpm db:seed — local/CI demo data. Refuses to run anywhere else (APP_ENV guard).
import { createMigratorClient } from '../clients.js';
import { requireEnv } from '../cli/env.js';
import { syncFeatureFlagDefinitions } from './flags.js';
import { assertSeedAllowed, SeedNotAllowedError } from './guard.js';
import { seedDevTenants } from './tenants.js';

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
  const tenants = await seedDevTenants(db);
  // Phase 2 adds one user per role.
  console.warn(`Seeded: ${flags} feature flag definition(s), ${tenants} demo academies.`);
} finally {
  await db.$disconnect();
}
