import { nodePreset, withSwc } from '@academybee/config/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig(withSwc(nodePreset()));
