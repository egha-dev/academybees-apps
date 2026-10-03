import { fileURLToPath } from 'node:url';

import { nodePreset } from '@academybee/config/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig(
  nodePreset({
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    test: { include: ['src/**/*.spec.ts'] },
  }),
);
