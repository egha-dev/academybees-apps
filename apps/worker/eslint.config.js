import { createConfig } from '@academybee/config/eslint';

export default [
  ...createConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    // Nest DI needs runtime class references in constructor parameters (decorator metadata).
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
];
