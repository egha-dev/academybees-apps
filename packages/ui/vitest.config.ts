import { jsdomPreset } from '@academybee/config/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig(
  jsdomPreset({ test: { setupFiles: ['src/test/setup.ts'], testTimeout: 20_000 } }),
);
