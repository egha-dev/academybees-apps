import type { TestProject } from 'vitest/node';

import {
  startPostgres,
  type DatabaseUrls,
  type StartPostgresOptions,
} from './containers/postgres.js';
import { startRedis } from './containers/redis.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrls: DatabaseUrls;
    redisUrl: string;
  }
}

export type IntegrationSetupOptions = StartPostgresOptions & {
  postgres?: boolean;
  redis?: boolean;
};

/**
 * Build a Vitest `globalSetup` that starts containers once per test run and provides their
 * URLs to tests via `inject('databaseUrls')` / `inject('redisUrl')`.
 *
 *   // test/global-setup.ts
 *   export default integrationGlobalSetup({ migrate: migrateAndApplySql, redis: true });
 */
export function integrationGlobalSetup(options: IntegrationSetupOptions = {}) {
  return async (project: TestProject) => {
    const stops: Array<() => Promise<void>> = [];
    const [pg, redis] = await Promise.all([
      options.postgres === false
        ? undefined
        : startPostgres(options.migrate ? { migrate: options.migrate } : {}),
      options.redis ? startRedis() : undefined,
    ]);
    if (pg) {
      project.provide('databaseUrls', pg.urls);
      stops.push(pg.stop);
    }
    if (redis) {
      project.provide('redisUrl', redis.url);
      stops.push(redis.stop);
    }
    return async () => {
      await Promise.all(stops.map((stop) => stop()));
    };
  };
}
