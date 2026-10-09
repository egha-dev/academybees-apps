import { describe, expect, it } from 'vitest';

import { contrastRatio, isReadableBrandColor } from './brand.js';

describe('brand colour rule (C-49)', () => {
  it('accepts colours that carry ink or ivory text at AA', () => {
    for (const c of ['#1F6F5C', '#9C3D54', '#2F4E8C', '#E6B94A', '#FFFFFF', '#000000'])
      expect(isReadableBrandColor(c), c).toBe(true);
  });

  it('refuses mid-tones where neither reads, and malformed values', () => {
    expect(isReadableBrandColor('#7A7A7A')).toBe(false); // 4.15 on ink, 4.10 on ivory
    expect(isReadableBrandColor('#767676')).toBe(false); // 3.92 and 4.34
    expect(isReadableBrandColor('red')).toBe(false);
    expect(isReadableBrandColor('#12345')).toBe(false);
  });

  it('computes WCAG ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });
});
