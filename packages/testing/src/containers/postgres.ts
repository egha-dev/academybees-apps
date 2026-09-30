import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

/** Same image and role bootstrap as `pnpm infra:up` (infra/postgres/init). */
export const POSTGRES_IMAGE = 'postgres:17-alpine';
const INIT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../infra/postgres/init',
);

export type DatabaseUrls = {
  /** ab_app — NO BYPASSRLS; what application code uses. */
  app: string;
  /** ab_platform — cross-tenant, platform code only. */
  platform: string;
  /** ab_migrator — schema owner. */
  migrator: string;
  /** ab_migrator on the shadow database (drift checks). */
  shadow: string;
  /** postgres superuser (test setup/inspection only). */
  superuser: string;
};

export type StartedPostgres = {
  container: StartedPostgreSqlContainer;
  urls: DatabaseUrls;
  stop: () => Promise<void>;
};

export type StartPostgresOptions = {
  /** Apply the schema, e.g. `migrateAndApplySql` from `@academybee/database/migrate`. */
  migrate?: (migratorUrl: string) => Promise<void>;
};

/** Start Postgres 17 with the ab_* roles and databases, then (optionally) migrate. */
export async function startPostgres(options: StartPostgresOptions = {}): Promise<StartedPostgres> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withUsername('postgres')
    .withPassword('postgres')
    .withDatabase('postgres')
    .withBindMounts([{ source: INIT_DIR, target: '/docker-entrypoint-initdb.d', mode: 'ro' }])
    .withTmpFs({ '/var/lib/postgresql/data': 'rw' })
    .withCommand(['postgres', '-c', 'fsync=off', '-c', 'synchronous_commit=off'])
    .start();

  const host = container.getHost();
  const port = container.getPort();
  const url = (user: string, password: string, db = 'academybee') =>
    `postgresql://${user}:${password}@${host}:${port}/${db}`;

  const urls: DatabaseUrls = {
    app: url('ab_app', 'ab_app_local'),
    platform: url('ab_platform', 'ab_platform_local'),
    migrator: url('ab_migrator', 'ab_migrator_local'),
    shadow: url('ab_migrator', 'ab_migrator_local', 'academybee_shadow'),
    superuser: url('postgres', 'postgres'),
  };

  if (options.migrate) await options.migrate(urls.migrator);

  return { container, urls, stop: async () => void (await container.stop()) };
}
