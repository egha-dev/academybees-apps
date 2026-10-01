import { describe, expect, it } from 'vitest';

import { isFlagOn } from './flags.js';

describe('isFlagOn', () => {
  it('is on only for an explicit true', () => {
    expect(isFlagOn({ flags: { 'p1-tenant-home': true } }, 'p1-tenant-home')).toBe(true);
  });

  it('fails closed for false, missing, malformed or unavailable responses', () => {
    expect(isFlagOn({ flags: { 'p1-tenant-home': false } }, 'p1-tenant-home')).toBe(false);
    expect(isFlagOn({ flags: {} }, 'p1-tenant-home')).toBe(false);
    expect(isFlagOn(null, 'p1-tenant-home')).toBe(false);
  });
});
