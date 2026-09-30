import { defineConfig } from 'vitest/config';

import { nodePreset } from './vitest/index.js';

export default defineConfig(
  nodePreset({ test: { include: ['test/**/*.spec.js'], testTimeout: 30_000 } }),
);
