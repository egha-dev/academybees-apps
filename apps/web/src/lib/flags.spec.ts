import { describe, expect, it } from 'vitest';

import { isFlagOn } from './flags.js';

describe('isFlagOn', () => {
  it('is on only for an explicit true', () => {
    expect(isFlagOn({ flags: { 'p5-scheduling': true } }, 'p5-scheduling')).toBe(true);
  });

  it('fails closed for false, missing, malformed or unavailable responses', () => {
    expect(isFlagOn({ flags: { 'p5-scheduling': false } }, 'p5-scheduling')).toBe(false);
    expect(isFlagOn({ flags: {} }, 'p5-scheduling')).toBe(false);
    expect(isFlagOn(null, 'p5-scheduling')).toBe(false);
  });
});
