import { describe, expect, it } from 'vitest';

import { errorMessage, type FieldLabels, passwordProblem } from './labels';

const errors = {
  invalidCredentials: 'invalid',
  rateLimited: 'rate',
  offline: 'offline',
  network: 'network',
  generic: 'generic',
};

describe('auth error copy', () => {
  it('maps API codes to one message, never raw text', () => {
    expect(errorMessage({ code: 'INVALID_CREDENTIALS', status: 401 }, errors)).toBe('invalid');
    expect(errorMessage({ code: 'RATE_LIMITED', status: 429 }, errors)).toBe('rate');
    expect(errorMessage({ code: 'FORBIDDEN', status: 403 }, errors)).toBe('generic');
    expect(errorMessage({ code: 'INTERNAL', status: 500 }, errors)).toBe('generic');
  });

  it('says how long to wait when the API sends Retry-After, rounded up', () => {
    const withWaits = {
      ...errors,
      rateLimitedIn: { 1: 'in 1', 2: 'in 2', 10: 'in 10', 60: 'in 60' },
    };
    const limited = (retryAfterSeconds?: number) =>
      errorMessage(
        { code: 'RATE_LIMITED', status: 429, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) },
        withWaits,
      );
    expect(limited(42)).toBe('in 1');
    expect(limited(61)).toBe('in 2');
    expect(limited(7 * 60)).toBe('in 10');
    expect(limited(3 * 3600)).toBe('in 60');
    expect(limited()).toBe('rate');
    // Without the pre-translated waits (older labels), the general message.
    expect(errorMessage({ code: 'RATE_LIMITED', status: 429, retryAfterSeconds: 42 }, errors)).toBe(
      'rate',
    );
  });

  it('explains a password-policy problem on the field', () => {
    const labels = { problems: { too_common: 'common' } } as unknown as FieldLabels;
    expect(
      passwordProblem(
        {
          code: 'VALIDATION_FAILED',
          status: 400,
          details: [{ path: 'password', issue: 'too_common' }],
        },
        labels,
      ),
    ).toBe('common');
    expect(passwordProblem({ code: 'VALIDATION_FAILED', status: 400 }, labels)).toBeUndefined();
  });
});
