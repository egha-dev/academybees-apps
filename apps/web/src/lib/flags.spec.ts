import { describe, expect, it } from 'vitest';

import { isFlagOn } from './flags.js';

describe('isFlagOn', () => {
  it('is on only for an explicit true', () => {
    expect(isFlagOn({ flags: { 'p1-hub-placeholder': true } }, 'p1-hub-placeholder')).toBe(true);
  });

  it('fails closed for false, missing, malformed or unavailable responses', () => {
    expect(isFlagOn({ flags: { 'p1-hub-placeholder': false } }, 'p1-hub-placeholder')).toBe(false);
    expect(isFlagOn({ flags: {} }, 'p1-hub-placeholder')).toBe(false);
    expect(isFlagOn(null, 'p1-hub-placeholder')).toBe(false);
  });
});
