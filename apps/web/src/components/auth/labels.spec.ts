import { describe, expect, it } from 'vitest';

import { errorMessage, type FieldLabels, passwordProblem } from './labels';

const errors = {
  invalidCredentials: 'invalid',
  rateLimited: 'rate',
  familyHub: 'hub',
  offline: 'offline',
  network: 'network',
  generic: 'generic',
};

describe('auth error copy', () => {
  it('maps API codes to one message, never raw text', () => {
    expect(errorMessage({ code: 'INVALID_CREDENTIALS', status: 401 }, errors)).toBe('invalid');
    expect(errorMessage({ code: 'RATE_LIMITED', status: 429 }, errors)).toBe('rate');
    expect(
      errorMessage(
        { code: 'FORBIDDEN', status: 403, details: [{ path: 'experience', issue: 'family_hub' }] },
        errors,
      ),
    ).toBe('hub');
    expect(errorMessage({ code: 'FORBIDDEN', status: 403 }, errors)).toBe('generic');
    expect(errorMessage({ code: 'INTERNAL', status: 500 }, errors)).toBe('generic');
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
