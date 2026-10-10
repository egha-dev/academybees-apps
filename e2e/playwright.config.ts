import { generateKeyPairSync, randomBytes } from 'node:crypto';

import { defineConfig, devices } from '@playwright/test';

import { E2E_CLIENT_IP_HEADER } from './support/client-ip.js';

/**
 * E2E (ADR-022, ADR-035, C-47). `pnpm e2e` from the repo root builds everything (including the
 * en-XA and en-LONG pseudo-locale web builds), then this config starts the built API and the
 * three web servers against the local infra (`pnpm infra:up && pnpm db:deploy`).
 *
 * E2E_BASE_HOST lets the specs target servers you started yourself (E2E_SKIP_SERVERS=1).
 */
const HOST = process.env.E2E_BASE_HOST ?? 'localhost';
const APP_ENV = process.env.APP_ENV ?? 'local';
const url = (port: number) => `http://${HOST}:${port}`;

/** Throwaway session secrets for the E2E API (C-64), generated per run. */
const signingKey = {
  ...generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' }),
  kid: 'e2e',
  alg: 'EdDSA',
};

/** Seals link tokens in the API and opens them in the worker (C-62): one value for both. */
// Kept in the environment so test workers (which re-load this file) share it: the console spec
// runs `platform:create-admin`, whose emailed link the worker must open.
process.env.E2E_SECRETS_MASTER_KEY ??= `e2e:${randomBytes(32).toString('base64')}`;
const SECRETS_MASTER_KEY = process.env.E2E_SECRETS_MASTER_KEY;

const API_ENV = {
  APP_ENV,
  NODE_ENV: 'production',
  PORT: '4000',
  LOG_LEVEL: 'warn',
  DATABASE_URL:
    process.env.E2E_DATABASE_URL ?? 'postgresql://ab_app:ab_app_local@localhost:5432/academybee',
  // The provisioning console (C-02) uses the platform client under src/platform/**.
  PLATFORM_DATABASE_URL:
    process.env.E2E_PLATFORM_DATABASE_URL ??
    'postgresql://ab_platform:ab_platform_local@localhost:5432/academybee',
  REDIS_URL: process.env.E2E_REDIS_URL ?? 'redis://localhost:6379',
  TRUSTED_PROXY_SECRET: 'local-proxy-secret',
  ANALYTICS_HASH_SALT: 'e2e-analytics-salt',
  AUTH_SIGNING_KEYS: JSON.stringify({ current: 'e2e', keys: [signingKey] }),
  SECRETS_MASTER_KEY,
  // WebKit drops Secure cookies on plain-http *.localhost (S6 spike, C-64).
  COOKIE_MODE: 'insecure-dev',
  FLAGS_CACHE_MS: '0',
  PLATFORM_ROOT_DOMAIN: 'localhost',
  // Logo uploads (C-97) go to the local SeaweedFS from infra/docker-compose.yml.
  MEDIA_S3_ENDPOINT: process.env.E2E_MEDIA_S3_ENDPOINT ?? 'http://localhost:8333',
  MEDIA_S3_ACCESS_KEY_ID: 'academybee',
  MEDIA_S3_SECRET_ACCESS_KEY: 'academybee-local-secret',
  MEDIA_PUBLIC_BUCKET: 'academybee-local',
  MEDIA_PUBLIC_BASE_URL: `${process.env.E2E_MEDIA_S3_ENDPOINT ?? 'http://localhost:8333'}/academybee-local`,
  MEDIA_PRIVATE_BUCKET: 'academybee-private-local',
};

const WEB_ENV = {
  APP_ENV,
  API_ORIGIN: 'http://localhost:4000',
  TRUSTED_PROXY_SECRET: 'local-proxy-secret',
  PLATFORM_ROOT_DOMAIN: 'localhost',
  // Console changes (suspend, address change) must show at once; the API's own host cache is
  // invalidated by every change (C-96).
  TENANT_CONTEXT_CACHE: 'off',
  // Every E2E browser comes from 127.0.0.1; specs send their own address in this header so the
  // per-IP sign-in limits apply per test, as they would per person (support/client-ip.ts).
  TRUSTED_CLIENT_IP_HEADER: E2E_CLIENT_IP_HEADER,
};

/** Delivers invite and reset emails to Mailpit (http://localhost:8025) for the auth journeys. */
const WORKER_ENV = {
  APP_ENV,
  NODE_ENV: 'production',
  // `info` so the start-up line Playwright waits for is printed.
  LOG_LEVEL: 'info',
  DATABASE_URL: API_ENV.DATABASE_URL,
  PLATFORM_DATABASE_URL: API_ENV.PLATFORM_DATABASE_URL,
  REDIS_URL: API_ENV.REDIS_URL,
  OUTBOX_POLL_INTERVAL_MS: '250',
  ANALYTICS_HASH_SALT: 'e2e-analytics-salt',
  SECRETS_MASTER_KEY,
  SMTP_URL: process.env.E2E_SMTP_URL ?? 'smtp://localhost:1025',
  PLATFORM_ROOT_DOMAIN: 'localhost',
  WEB_PUBLIC_PROTOCOL: 'http',
  WEB_PUBLIC_PORT: '3000',
};

const webServer = (port: number, distDir: string, locale = '') => ({
  command: `pnpm exec next start -p ${port}`,
  cwd: '../apps/web',
  url: `http://localhost:${port}/offline`,
  env: { ...WEB_ENV, NEXT_DIST_DIR: distDir, NEXT_PUBLIC_LOCALE_OVERRIDE: locale },
  reuseExistingServer: !process.env.CI,
  timeout: 60_000,
});

export default defineConfig({
  testDir: './specs',
  outputDir: './artifacts/test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { outputFolder: './artifacts/report', open: 'never' }]],
  use: {
    baseURL: url(3000),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /i18n-pseudo/ },
    {
      name: 'android-chromium',
      use: { ...devices['Pixel 7'] },
      testIgnore: /i18n-pseudo|flag\.spec/,
    },
    {
      name: 'iphone-webkit',
      use: { ...devices['iPhone 14'] },
      testIgnore: /i18n-pseudo|flag\.spec|pwa\.spec/,
    },
    {
      name: 'pseudo-accented',
      use: { ...devices['Desktop Chrome'], baseURL: url(3001) },
      testMatch: /i18n-pseudo/,
    },
    {
      name: 'pseudo-long',
      use: { ...devices['Desktop Chrome'], baseURL: url(3002) },
      testMatch: /i18n-pseudo/,
    },
  ],
  webServer: process.env.E2E_SKIP_SERVERS
    ? undefined
    : [
        {
          command: 'node dist/main.js',
          cwd: '../apps/api',
          url: 'http://localhost:4000/api/v1/health/ready',
          env: API_ENV,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
        {
          command: 'node dist/main.js',
          cwd: '../apps/worker',
          // No HTTP port: ready when it logs that it started (always a fresh worker, so emails
          // are sealed and opened with this run's key).
          wait: { stdout: /Worker started/ },
          env: WORKER_ENV,
          timeout: 60_000,
        },
        webServer(3000, '.next'),
        webServer(3001, '.next-xa', 'en-XA'),
        webServer(3002, '.next-long', 'en-LONG'),
      ],
});
