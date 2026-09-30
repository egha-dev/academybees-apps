import { integrationPreset, withSwc } from '@academybee/config/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig(
  withSwc(integrationPreset({ test: { globalSetup: ['test/global-setup.ts'] } })),
);
