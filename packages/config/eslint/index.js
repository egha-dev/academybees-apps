// AcademyBee shared ESLint flat config.
// - Architectural boundaries (ARCHITECTURE §3, ADR-001, ADR-041) via eslint-plugin-boundaries.
// - App code imports UI only from @academybee/ui, never @mui/* (ADR-014, C-20).
// - The platform (cross-tenant) Prisma client is confined to platform code (ADR-005).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Repository root (packages/config/eslint → repo). */
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Import specifiers of the platform (ab_platform, cross-tenant) Prisma client. */
export const PLATFORM_CLIENT_IMPORTS = ['@academybee/database/platform'];

/** Folders (relative to the repo root) allowed to use the platform client. Tests may use it to set up and inspect data. */
export const PLATFORM_ALLOWED_GLOBS = [
  'apps/api/src/platform/**',
  'apps/worker/src/platform/**',
  'apps/*/test/**',
  'packages/*/test/**',
];

const MUI_RESTRICTION = {
  group: ['@mui/*', '@mui/**'],
  message: 'Import UI from @academybee/ui — @mui/* is only used inside packages/ui (ADR-014).',
};

const PLATFORM_RESTRICTION = {
  group: PLATFORM_CLIENT_IMPORTS,
  message:
    'The platform (cross-tenant) Prisma client may only be used under src/platform/** and is audited (ADR-005). Use the tenant-bound client.',
};

/** Element types for eslint-plugin-boundaries. Order matters: the first match wins. */
const ELEMENTS = [
  { type: 'api-module', pattern: 'apps/api/src/modules/*', capture: ['module'] },
  { type: 'api-core', pattern: 'apps/api/src/core' },
  { type: 'api-platform', pattern: 'apps/api/src/platform' },
  { type: 'app', pattern: 'apps/*', capture: ['app'] },
  { type: 'package', pattern: 'packages/*', capture: ['pkg'] },
  { type: 'e2e', pattern: 'e2e' },
];

const API_ELEMENTS = ['api-module', 'api-core', 'api-platform'];

/**
 * Dependency policies (default: allow; the list below only forbids).
 * - packages never depend on apps (or e2e);
 * - an app never imports another app;
 * - API core never depends on domain or platform modules;
 * - domain modules never depend on platform modules;
 * - a domain module reaches another module only through its public index (see entry-point rule).
 */
const DEPENDENCY_POLICIES = [
  {
    from: { element: { type: 'package' } },
    disallow: { to: { element: { types: { anyOf: ['app', 'e2e', ...API_ELEMENTS] } } } },
    message: 'packages/* must never depend on apps/* (ARCHITECTURE §3).',
  },
  {
    from: { element: { type: 'app' } },
    disallow: {
      to: { element: { type: 'app', captured: { app: '!{{ from.captured.app }}' } } },
    },
    message: 'An app may not import another app; share code through packages/* (ARCHITECTURE §3).',
  },
  {
    from: { element: { type: 'app', captured: { app: '!api' } } },
    disallow: { to: { element: { types: { anyOf: API_ELEMENTS } } } },
    message: 'An app may not import another app; share code through packages/* (ARCHITECTURE §3).',
  },
  {
    from: { element: { types: { anyOf: API_ELEMENTS } } },
    disallow: { to: { element: { type: 'app', captured: { app: '!api' } } } },
    message: 'An app may not import another app; share code through packages/* (ARCHITECTURE §3).',
  },
  {
    from: { element: { type: 'api-core' } },
    disallow: { to: { element: { types: { anyOf: ['api-module', 'api-platform'] } } } },
    message: 'API core must not depend on domain or platform modules.',
  },
  {
    from: { element: { type: 'api-module' } },
    disallow: { to: { element: { type: 'api-platform' } } },
    message: 'Domain modules must not depend on platform (console) modules.',
  },
  {
    // A module reaches another module only through its index.ts (exported service interface).
    from: { element: { type: 'api-module' } },
    disallow: {
      to: {
        element: {
          type: 'api-module',
          captured: { module: '!{{ from.captured.module }}' },
          fileInternalPath: '!index.ts',
        },
      },
    },
    message: 'Import another module only through its index.ts (exported service interface).',
  },
];

/**
 * @param {object} [options]
 * @param {string} [options.rootDir] Repository root used to classify files (tests pass a fixture repo).
 * @param {boolean} [options.typeChecked] Enable type-aware lint rules (needs a tsconfig for every linted file).
 * @param {string} [options.tsconfigRootDir] Directory of the package being linted (for type-aware rules).
 * @param {string[]} [options.ignores] Extra ignore globs.
 * @returns {import('eslint').Linter.Config[]}
 */
export function createConfig(options = {}) {
  const { rootDir = repoRoot, typeChecked = true, tsconfigRootDir, ignores = [] } = options;

  return [
    {
      ignores: [
        '**/dist/**',
        '**/.next/**',
        '**/coverage/**',
        '**/node_modules/**',
        '**/.turbo/**',
        '**/next-env.d.ts',
        ...ignores,
      ],
    },
    js.configs.recommended,
    ...(typeChecked ? tseslint.configs.recommendedTypeChecked : tseslint.configs.recommended),
    {
      languageOptions: {
        ecmaVersion: 2024,
        sourceType: 'module',
        globals: { ...globals.node },
        ...(typeChecked
          ? {
              parserOptions: {
                projectService: { allowDefaultProject: ['*.config.ts', '*.config.mts'] },
                ...(tsconfigRootDir ? { tsconfigRootDir } : {}),
              },
            }
          : {}),
      },
      plugins: { boundaries: /** @type {any} */ (boundaries) },
      settings: {
        'boundaries/root-path': rootDir,
        'boundaries/elements': ELEMENTS,
        'boundaries/include': ['apps/**/*', 'packages/**/*', 'e2e/**/*'],
        'import/resolver': {
          typescript: {
            alwaysTryTypes: true,
            conditionNames: ['@academybee/source', 'import', 'types', 'default'],
          },
          node: true,
        },
      },
      rules: {
        'boundaries/dependencies': ['error', { default: 'allow', policies: DEPENDENCY_POLICIES }],
        'no-restricted-imports': ['error', { patterns: [MUI_RESTRICTION, PLATFORM_RESTRICTION] }],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { fixStyle: 'inline-type-imports' },
        ],
        eqeqeq: ['error', 'always'],
        'no-console': ['error', { allow: ['warn', 'error'] }],
      },
    },
    {
      // packages/ui is the only place allowed to use MUI directly.
      basePath: rootDir,
      files: ['packages/ui/**'],
      rules: { 'no-restricted-imports': ['error', { patterns: [PLATFORM_RESTRICTION] }] },
    },
    {
      // Platform code (console modules, platform jobs) may use the platform client.
      basePath: rootDir,
      files: PLATFORM_ALLOWED_GLOBS,
      rules: { 'no-restricted-imports': ['error', { patterns: [MUI_RESTRICTION] }] },
    },
    {
      files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
      ...(typeChecked ? tseslint.configs.disableTypeChecked : {}),
    },
    {
      files: ['**/*.{spec,test}.{ts,tsx}', '**/test/**'],
      rules: {
        'no-console': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        // HTTP test clients (supertest) type response bodies as `any`.
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
      },
    },
    prettier,
  ];
}

export default createConfig;
