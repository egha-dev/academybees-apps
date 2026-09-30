import path from 'node:path';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

import { createConfig } from '../eslint/index.js';

const fixtureRoot = path.join(import.meta.dirname, 'fixtures/repo');

const eslint = new ESLint({
  cwd: fixtureRoot,
  overrideConfigFile: true,
  overrideConfig: createConfig({ rootDir: fixtureRoot, typeChecked: false }),
});

/** @param {string} file @returns {Promise<string[]>} rule IDs reported for the fixture file */
async function ruleIds(file) {
  const [result] = await eslint.lintFiles([path.join(fixtureRoot, file)]);
  return (result?.messages ?? []).map((m) => m.ruleId ?? `fatal: ${m.message}`);
}

describe('shared ESLint config', () => {
  it('rejects @mui/* imports in app code (ADR-014)', async () => {
    expect(await ruleIds('apps/web/src/mui-import.ts')).toContain('no-restricted-imports');
  });

  it('allows @mui/* inside packages/ui', async () => {
    expect(await ruleIds('packages/ui/src/button.ts')).toEqual([]);
  });

  it('rejects an app importing another app', async () => {
    expect(await ruleIds('apps/web/src/imports-api.ts')).toContain('boundaries/dependencies');
    expect(await ruleIds('apps/api/src/core/imports-web.ts')).toContain('boundaries/dependencies');
    expect(await ruleIds('apps/web/src/imports-worker.ts')).toContain('boundaries/dependencies');
  });

  it('rejects a package importing an app', async () => {
    expect(await ruleIds('packages/foo/src/imports-app.ts')).toContain('boundaries/dependencies');
  });

  it('rejects API core depending on a domain module', async () => {
    expect(await ruleIds('apps/api/src/core/uses-module.ts')).toContain('boundaries/dependencies');
  });

  it('rejects reaching into another module internals, allows its index', async () => {
    expect(await ruleIds('apps/api/src/modules/billing/uses-internal.ts')).toContain(
      'boundaries/dependencies',
    );
    expect(await ruleIds('apps/api/src/modules/billing/uses-index.ts')).toEqual([]);
    expect(await ruleIds('apps/api/src/modules/students/index.ts')).toEqual([]);
  });

  it('confines the platform Prisma client to platform code (ADR-005)', async () => {
    expect(await ruleIds('apps/api/src/modules/students/uses-platform-client.ts')).toContain(
      'no-restricted-imports',
    );
    expect(await ruleIds('apps/api/src/platform/uses-platform-client.ts')).toEqual([]);
  });

  it('accepts clean code', async () => {
    expect(await ruleIds('apps/web/src/ok.ts')).toEqual([]);
  });
});
