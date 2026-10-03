import { describe, expect, it } from 'vitest';

import { isFlagOn } from './flags.js';

describe('isFlagOn', () => {
  it('is on only for an explicit true', () => {
    expect(isFlagOn({ flags: { 'p2-role-homes': true } }, 'p2-role-homes')).toBe(true);
  });

  it('fails closed for false, missing, malformed or unavailable responses', () => {
    expect(isFlagOn({ flags: { 'p2-role-homes': false } }, 'p2-role-homes')).toBe(false);
    expect(isFlagOn({ flags: {} }, 'p2-role-homes')).toBe(false);
    expect(isFlagOn(null, 'p2-role-homes')).toBe(false);
  });
});
