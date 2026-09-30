import { createConfig } from '@academybee/config/eslint';
import { reactConfig } from '@academybee/config/eslint/react';
import nextPlugin from '@next/eslint-plugin-next';

export default [
  ...createConfig({ tsconfigRootDir: import.meta.dirname, ignores: ['public/**'] }),
  ...reactConfig(),
  {
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
];
