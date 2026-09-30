import type { Linter } from 'eslint';

export declare const repoRoot: string;
export declare const PLATFORM_CLIENT_IMPORTS: string[];
export declare const PLATFORM_ALLOWED_GLOBS: string[];

export interface CreateConfigOptions {
  rootDir?: string;
  typeChecked?: boolean;
  tsconfigRootDir?: string;
  ignores?: string[];
}

export declare function createConfig(options?: CreateConfigOptions): Linter.Config[];
export default createConfig;
