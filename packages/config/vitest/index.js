// Vitest presets. Every package resolves workspace dependencies from TypeScript source
// through the "@academybee/source" export condition (C-42), so tests never need a build.
import swc from 'unplugin-swc';

const SOURCE_CONDITION = '@academybee/source';

/**
 * Unit tests in Node. `pnpm test` runs *.spec.ts and excludes *.int.spec.ts.
 * @param {import('vitest/config').ViteUserConfig} [overrides]
 * @returns {import('vitest/config').ViteUserConfig}
 */
export function nodePreset(overrides = {}) {
  return merge(
    {
      resolve: { conditions: [SOURCE_CONDITION] },
      ssr: { resolve: { conditions: [SOURCE_CONDITION] } },
      test: {
        environment: 'node',
        include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
        exclude: ['**/node_modules/**', '**/dist/**', '**/*.int.spec.ts'],
        passWithNoTests: false,
        restoreMocks: true,
      },
    },
    overrides,
  );
}

/**
 * Integration tests (Testcontainers). `pnpm test:integration` runs *.int.spec.ts only.
 * @param {import('vitest/config').ViteUserConfig} [overrides]
 */
export function integrationPreset(overrides = {}) {
  return nodePreset(
    merge(
      {
        test: {
          include: ['src/**/*.int.spec.ts', 'test/**/*.int.spec.ts'],
          exclude: ['**/node_modules/**', '**/dist/**'],
          testTimeout: 60_000,
          hookTimeout: 180_000,
          fileParallelism: false,
        },
      },
      overrides,
    ),
  );
}

/**
 * NestJS: SWC transform so decorator metadata (DI) works under Vitest.
 * @param {import('vitest/config').ViteUserConfig} base A node or integration preset.
 */
export function withSwc(base) {
  return merge(base, {
    oxc: false,
    plugins: [swc.vite({ module: { type: 'es6' }, jsc: { target: 'es2023' } })],
  });
}

/**
 * React components in jsdom.
 * @param {import('vitest/config').ViteUserConfig} [overrides]
 */
export function jsdomPreset(overrides = {}) {
  return nodePreset(
    merge(
      {
        test: {
          environment: 'jsdom',
          include: ['src/**/*.spec.{ts,tsx}', 'test/**/*.spec.{ts,tsx}'],
        },
      },
      overrides,
    ),
  );
}

/**
 * Shallow-recursive merge for plain config objects; arrays in `b` replace arrays in `a`.
 * @template {Record<string, any>} T
 * @param {T} a
 * @param {Record<string, any>} b
 * @returns {T}
 */
function merge(a, b) {
  /** @type {Record<string, any>} */
  const out = { ...a };
  for (const [key, value] of Object.entries(b)) {
    const prev = out[key];
    out[key] = isPlainObject(prev) && isPlainObject(value) ? merge(prev, value) : value;
  }
  return /** @type {T} */ (out);
}

/** @param {unknown} v @returns {v is Record<string, any>} */
function isPlainObject(v) {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}
