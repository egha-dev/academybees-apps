import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const run = promisify(execFile);

/** The built API refuses to boot on invalid config (ARCHITECTURE §4.3). Requires `pnpm build`. */
describe('API boot', () => {
  it('exits with a readable error when config is invalid', async () => {
    const result = run('node', ['dist/main.js'], {
      cwd: new URL('../..', import.meta.url),
      env: {
        PATH: process.env.PATH,
        APP_ENV: 'production',
        DATABASE_URL: 'mysql://u:topsecret@h/db',
      },
      timeout: 20_000,
    });
    await expect(result).rejects.toMatchObject({ code: 1 });
    const { stderr } = (await result.catch((e: unknown) => e)) as { stderr: string };
    expect(stderr).toContain('Invalid API configuration');
    expect(stderr).toContain('DATABASE_URL');
    expect(stderr).toContain('REDIS_URL');
    expect(stderr).not.toContain('topsecret');
  });
});
