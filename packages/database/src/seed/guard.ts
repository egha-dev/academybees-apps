/** Seeds create demo data; they must never run outside local development and CI (CLAUDE.md §5). */
export const SEED_ALLOWED_ENVS = ['local', 'ci'] as const;

export class SeedNotAllowedError extends Error {
  constructor(appEnv: string | undefined) {
    super(
      `Refusing to seed: APP_ENV is "${appEnv ?? '(unset)'}". Seeds run only when APP_ENV is local or ci.`,
    );
    this.name = 'SeedNotAllowedError';
  }
}

export function assertSeedAllowed(appEnv: string | undefined): void {
  if (!SEED_ALLOWED_ENVS.includes(appEnv as (typeof SEED_ALLOWED_ENVS)[number])) {
    throw new SeedNotAllowedError(appEnv);
  }
}
