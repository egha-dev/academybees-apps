import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { describe, expect, inject, it } from 'vitest';

import { checkDrift } from '../src/migrate.js';

const run = promisify(execFile);
const urls = inject('databaseUrls');

async function seed(appEnv: string) {
  return run('pnpm', ['exec', 'tsx', '--conditions=@academybee/source', 'src/seed/run.ts'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, APP_ENV: appEnv, MIGRATOR_DATABASE_URL: urls.migrator },
  });
}

describe('seed runner', () => {
  it('refuses to run with APP_ENV=production', async () => {
    await expect(seed('production')).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('Refusing to seed') as unknown,
    });
  });

  it('runs with APP_ENV=ci and is repeatable', async () => {
    await seed('ci');
    const { stderr } = await seed('ci');
    expect(stderr).toContain('Seeded: 1 feature flag definition(s).');
  });
});

describe('migration drift', () => {
  it('committed migrations match prisma/schema', async () => {
    expect(await checkDrift(urls.migrator, urls.shadow)).toBe('');
  });
});
