import { defineConfig, devices } from '@playwright/test';

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

const API_ENV = {
  APP_ENV,
  NODE_ENV: 'production',
  PORT: '4000',
  LOG_LEVEL: 'warn',
  DATABASE_URL:
    process.env.E2E_DATABASE_URL ?? 'postgresql://ab_app:ab_app_local@localhost:5432/academybee',
  REDIS_URL: process.env.E2E_REDIS_URL ?? 'redis://localhost:6379',
  TRUSTED_PROXY_SECRET: 'local-proxy-secret',
  ANALYTICS_HASH_SALT: 'e2e-analytics-salt',
  FLAGS_CACHE_MS: '0',
  PLATFORM_ROOT_DOMAIN: 'localhost',
};

const WEB_ENV = {
  APP_ENV,
  API_ORIGIN: 'http://localhost:4000',
  TRUSTED_PROXY_SECRET: 'local-proxy-secret',
  PLATFORM_ROOT_DOMAIN: 'localhost',
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
        webServer(3000, '.next'),
        webServer(3001, '.next-xa', 'en-XA'),
        webServer(3002, '.next-long', 'en-LONG'),
      ],
});
