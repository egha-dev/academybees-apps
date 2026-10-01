import { describe, expect, it } from 'vitest';

import { brandIdentityColors, contrast } from './brand.js';

describe('brandIdentityColors (C-49)', () => {
  it.each(['#1F6F5C', '#9C3D54', '#2F4E8C', '#7A4B12', '#E6B94A', '#FFFFFF', '#000000'])(
    '%s gets a text colour at ≥ 4.5:1',
    (hex) => {
      const colors = brandIdentityColors(hex);
      expect(colors).not.toBeNull();
      expect(contrast(colors!.background, colors!.foreground)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('falls back when no text colour reaches 4.5:1 or the value is invalid', () => {
    expect(brandIdentityColors('#777777')).toBeNull();
    expect(brandIdentityColors('red')).toBeNull();
    expect(brandIdentityColors(null)).toBeNull();
  });
});
