import type { ViteUserConfig } from 'vitest/config';

export declare function nodePreset(overrides?: ViteUserConfig): ViteUserConfig;
export declare function integrationPreset(overrides?: ViteUserConfig): ViteUserConfig;
export declare function withSwc(base: ViteUserConfig): ViteUserConfig;
export declare function jsdomPreset(overrides?: ViteUserConfig): ViteUserConfig;
