import { describe, expect, it } from 'vitest';

import { isReservedSlug, RESERVED_SLUGS } from './reserved.js';
import { validateSlug } from './slug.js';

describe('validateSlug', () => {
  it.each(['gurushethra', 'abc', 'sunrise-dance', 'karate-123', 'a1b', '  Gurushethra '])(
    'accepts %j',
    (input) => {
      expect(validateSlug(input).ok).toBe(true);
    },
  );

  it.each([
    ['', 'empty'],
    ['ab', 'too_short'],
    ['a'.repeat(43), 'too_long'],
    ['-abc', 'format'],
    ['abc-', 'format'],
    ['ab_c', 'format'],
    ['ab.c', 'format'],
    ['आरव-academy', 'format'],
    ['ab--c', 'double_hyphen'],
    ['xn--abc', 'double_hyphen'],
    ['app', 'reserved'],
    ['console', 'reserved'],
    ['demo', 'reserved'],
    ['WWW', 'reserved'],
  ] as const)('rejects %j as %s', (input, problem) => {
    expect(validateSlug(input)).toMatchObject({ ok: false, problem });
  });

  it('reserves the Family Hub host and every listed name', () => {
    expect(isReservedSlug('app')).toBe(true);
    for (const slug of RESERVED_SLUGS) expect(validateSlug(slug).ok).toBe(false);
  });
});
