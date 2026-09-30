import { describe, expect, it } from 'vitest';

import { isFlagOn } from './flags.js';

describe('isFlagOn', () => {
  it('is on only for an explicit true', () => {
    expect(isFlagOn({ flags: { 'p0-flag-probe': true } }, 'p0-flag-probe')).toBe(true);
  });

  it('fails closed for false, missing, malformed or unavailable responses', () => {
    expect(isFlagOn({ flags: { 'p0-flag-probe': false } }, 'p0-flag-probe')).toBe(false);
    expect(isFlagOn({ flags: {} }, 'p0-flag-probe')).toBe(false);
    expect(isFlagOn(null, 'p0-flag-probe')).toBe(false);
  });
});
