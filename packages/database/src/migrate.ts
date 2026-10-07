// Migration helpers shared by the CLI scripts, deploy jobs and Testcontainers setups.
import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import pg from 'pg';

import { syncReferenceData } from './reference.js';

const run = promisify(execFile);

/** packages/database (works from src/ and dist/). */
export const DATABASE_PACKAGE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const SQL_DIR = path.join(DATABASE_PACKAGE_DIR, 'prisma/sql');
const PRISMA_BIN = path.join(DATABASE_PACKAGE_DIR, 'node_modules/.bin/prisma');

/** Environment for Prisma CLI calls (prisma.config.ts reads these). */
function prismaEnv(migratorUrl: string, shadowUrl?: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    MIGRATOR_DATABASE_URL: migratorUrl,
    ...(shadowUrl ? { SHADOW_DATABASE_URL: shadowUrl } : {}),
  };
}

/** `prisma migrate deploy` as the schema owner. */
export async function migrateDeploy(migratorUrl: string): Promise<void> {
  await run(PRISMA_BIN, ['migrate', 'deploy'], {
    cwd: DATABASE_PACKAGE_DIR,
    env: prismaEnv(migratorUrl),
  });
}

/**
 * Apply the idempotent grant/RLS SQL files (prisma/sql/*.sql, in name order), then sync the
 * platform reference data (plans, legal documents) from the contracts catalogues.
 */
export async function applySqlFolder(migratorUrl: string): Promise<string[]> {
  const files = (await readdir(SQL_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const client = new pg.Client({ connectionString: migratorUrl });
  await client.connect();
  try {
    for (const file of files) {
      await client.query(await readFile(path.join(SQL_DIR, file), 'utf8'));
    }
    await syncReferenceData(client);
  } finally {
    await client.end();
  }
  return files;
}

/** Everything a fresh database needs: migrations then SQL folder. */
export async function migrateAndApplySql(migratorUrl: string): Promise<void> {
  await migrateDeploy(migratorUrl);
  await applySqlFolder(migratorUrl);
}

/**
 * Drift check: do the committed migrations produce exactly the Prisma schema?
 * Returns the diff script (empty string = no drift). Needs a shadow database.
 */
export async function checkDrift(migratorUrl: string, shadowUrl: string): Promise<string> {
  try {
    await run(
      PRISMA_BIN,
      [
        'migrate',
        'diff',
        '--from-migrations',
        'prisma/migrations',
        '--to-schema',
        'prisma/schema',
        '--script',
        '--exit-code',
      ],
      { cwd: DATABASE_PACKAGE_DIR, env: prismaEnv(migratorUrl, shadowUrl) },
    );
    return '';
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string };
    if (e.code === 2) return e.stdout ?? 'drift detected';
    throw new Error(`prisma migrate diff failed: ${e.stderr ?? String(error)}`);
  }
}
