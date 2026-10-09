import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { totpCode } from '@academybee/auth';
import { expect, type Page } from '@playwright/test';

import { signIn } from './session.js';

/**
 * Create a console admin with the real CLI (`pnpm platform:create-admin`, C-66) against the E2E
 * database and return the set-password link it prints. Needs the API build (`pnpm e2e` builds it).
 */
export function createConsoleAdmin(email: string): string {
  const script = fileURLToPath(
    new URL('../../apps/api/dist/platform/cli/create-admin.js', import.meta.url),
  );
  const out = execFileSync(
    process.execPath,
    [script, '--email', email, '--name', 'Console Tester'],
    {
      env: {
        ...process.env,
        APP_ENV: 'ci',
        PLATFORM_DATABASE_URL:
          process.env.E2E_PLATFORM_DATABASE_URL ??
          'postgresql://ab_platform:ab_platform_local@localhost:5432/academybee',
        SECRETS_MASTER_KEY: process.env.E2E_SECRETS_MASTER_KEY ?? '',
        PLATFORM_ROOT_DOMAIN: 'localhost',
        WEB_PUBLIC_PROTOCOL: 'http',
        WEB_PUBLIC_PORT: '3000',
      },
      encoding: 'utf8',
    },
  );
  const link = /https?:\/\/console\.\S+/.exec(out)?.[0];
  if (!link) throw new Error(`create-admin printed no link:\n${out}`);
  return link;
}

/**
 * A brand-new console admin, signed in on the console host of this project: CLI link → password
 * → TOTP enrolment → recovery codes (C-66). Leaves the page on the academies list.
 */
export async function signInNewConsoleAdmin(
  page: Page,
  consoleUrl: (path?: string) => string,
  email: string,
  password: string,
): Promise<void> {
  const link = createConsoleAdmin(email);
  await page.goto(link.replace('http://console.localhost:3000', consoleUrl('').replace(/\/$/, '')));
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByLabel('Confirm new password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await page.getByRole('link', { name: 'Sign in' }).click();
  await signIn(page, email, password);
  const secret = (await page.getByTestId('manual-key').innerText()).replace(/\s/g, '');
  await page.getByLabel('6-digit code').fill(totpCode(secret));
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await page.getByRole('button', { name: "I've saved them — continue" }).click();
  await expect(page).toHaveURL(consoleUrl('/academies'));
}
