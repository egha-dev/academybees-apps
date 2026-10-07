import 'reflect-metadata';

import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { testAuthEnv } from '@academybee/testing';
import { inject } from 'vitest';

import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/configure-app.js';
import { type ApiConfig, loadApiConfig } from '../../src/core/config/config.schema.js';
import { TestSupportModule } from './test-support.module.js';

/** One key set per test process, shared by every app instance (tokens stay valid across apps). */
const AUTH_ENV = testAuthEnv();

export function testConfig(overrides: Record<string, string> = {}): ApiConfig {
  const urls = inject('databaseUrls');
  return loadApiConfig({
    APP_ENV: 'ci',
    NODE_ENV: 'test',
    LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'silent',
    DATABASE_URL: urls.app,
    PLATFORM_DATABASE_URL: urls.platform,
    REDIS_URL: inject('redisUrl'),
    TRUSTED_PROXY_SECRET: 'test-proxy-secret-0123',
    ANALYTICS_HASH_SALT: 'test-salt',
    ...AUTH_ENV,
    // Supertest talks plain http to *.localhost hosts (C-64).
    COOKIE_MODE: 'insecure-dev',
    ...overrides,
  });
}

/** The real app (same modules and configureApp as production) plus test-only routes. */
export async function createTestApp(config = testConfig()): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(config, [TestSupportModule])],
  }).compile();
  const app = moduleRef.createNestApplication({ bodyParser: false });
  configureApp(app, config);
  await app.init();
  return app;
}
