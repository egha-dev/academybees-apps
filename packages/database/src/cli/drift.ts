// pnpm db:drift — fails when the committed migrations don't match prisma/schema.
import { checkDrift } from '../migrate.js';
import { requireEnv } from './env.js';

const diff = await checkDrift(
  requireEnv('MIGRATOR_DATABASE_URL'),
  requireEnv('SHADOW_DATABASE_URL'),
);
if (diff) {
  console.error('Schema drift: prisma/schema differs from prisma/migrations.\n');
  console.error(diff);
  console.error('Run `pnpm db:migrate` to create a migration, review it and commit it.');
  process.exit(1);
}
console.warn('No drift: migrations match the Prisma schema.');
