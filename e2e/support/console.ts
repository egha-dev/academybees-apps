import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
        WEB_PUBLIC_PORT: process.env.E2E_WEB_PORT ?? '3000',
      },
      encoding: 'utf8',
    },
  );
  const link = /https?:\/\/console\.\S+/.exec(out)?.[0];
  if (!link) throw new Error(`create-admin printed no link:\n${out}`);
  return link;
}
