// pnpm db:seed — local/CI demo data. Refuses to run anywhere else (APP_ENV guard).
import { createMigratorClient } from '../clients.js';
import { requireEnv } from '../cli/env.js';
import { syncFeatureFlagDefinitions } from './flags.js';
import { assertSeedAllowed, SeedNotAllowedError } from './guard.js';
import { seedDevPeople } from './people.js';
import { seedDevTenants } from './tenants.js';
import { seedDevUsers } from './users.js';

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
  const users = await seedDevUsers(db);
  const students = await seedDevPeople(db);
  console.warn(
    `Seeded: ${flags} feature flag definition(s), ${tenants} demo academies, ${users} demo users, ${students} demo students.`,
  );
} finally {
  await db.$disconnect();
}
