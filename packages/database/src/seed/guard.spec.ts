import { describe, expect, it } from 'vitest';

import { assertSeedAllowed, SeedNotAllowedError } from './guard.js';

describe('seed guard', () => {
  it.each(['local', 'ci'])('allows APP_ENV=%s', (env) => {
    expect(() => assertSeedAllowed(env)).not.toThrow();
  });

  it.each(['production', 'staging', '', undefined, 'LOCAL'])('refuses APP_ENV=%s', (env) => {
    expect(() => assertSeedAllowed(env)).toThrow(SeedNotAllowedError);
  });
});
