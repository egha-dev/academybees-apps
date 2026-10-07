// pnpm db:migrate / db:deploy (second step): apply prisma/sql/*.sql as the schema owner.
import { applySqlFolder } from '../migrate.js';
import { requireEnv } from './env.js';

const files = await applySqlFolder(requireEnv('MIGRATOR_DATABASE_URL'));
console.warn(`Applied ${files.length} SQL file(s): ${files.join(', ')}; reference data synced`);
