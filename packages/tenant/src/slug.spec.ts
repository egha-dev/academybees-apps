import { describe, expect, it } from 'vitest';

import { isReservedSlug, RESERVED_SLUGS } from './reserved.js';
import { validateSlug, slugAlternatives, slugFromName } from './slug.js';

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

describe('impersonation (C-88)', () => {
  it.each([
    'academybees',
    'academybee-support',
    'paytm',
    'paytm-classes',
    'sbi-coaching',
    'uidai',
    'apple',
    'india',
  ])('refuses %s as reserved', (slug) => {
    expect(validateSlug(slug)).toMatchObject({ ok: false, problem: 'reserved' });
  });

  it.each([
    'apple-kids-school',
    'axis-dance',
    'india-music-academy',
    'gurushethra',
    'metaverse-art',
  ])('allows the ordinary name %s', (slug) => {
    expect(validateSlug(slug)).toEqual({ ok: true, slug });
  });
});

describe('slugFromName', () => {
  it('turns academy names into slugs', () => {
    expect(slugFromName('Gurushethra')).toBe('gurushethra');
    expect(slugFromName('  Natya Kala — Bharatanatyam & Music!  ')).toBe(
      'natya-kala-bharatanatyam-and-music',
    );
    expect(slugFromName('Café Ballet')).toBe('cafe-ballet');
    expect(slugFromName('நடனம்')).toBe('');
    expect(slugFromName('x'.repeat(60))).toHaveLength(42);
  });
});

describe('slugAlternatives', () => {
  it('offers valid, unreserved alternatives', () => {
    const alts = slugAlternatives('gurushethra');
    expect(alts.slice(0, 3)).toEqual([
      'gurushethra-academy',
      'the-gurushethra',
      'gurushethra-classes',
    ]);
    for (const a of alts) expect(validateSlug(a).ok).toBe(true);
    expect(slugAlternatives('')).toEqual([]);
  });
});
