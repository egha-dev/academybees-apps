import { integrationPreset } from '@academybee/config/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig(integrationPreset({ test: { globalSetup: ['test/global-setup.ts'] } }));
