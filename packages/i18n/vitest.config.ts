import { nodePreset } from '@academybee/config/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig(
  nodePreset({ test: { include: ['src/**/*.spec.ts', 'scripts/**/*.spec.ts'] } }),
);
