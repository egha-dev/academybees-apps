import { describe, expect, it } from 'vitest';

import { parseAmountMinor } from './opening-balance.js';

describe('opening balance amounts (G-02)', () => {
  it('reads what spreadsheets hold', () => {
    expect(parseAmountMinor('12500')).toBe(1_250_000);
    expect(parseAmountMinor('12,500.50')).toBe(1_250_050);
    expect(parseAmountMinor('₹ 1,00,000')).toBe(10_000_000);
    expect(parseAmountMinor('Rs. 99.9')).toBe(9_990);
    expect(parseAmountMinor('0.07')).toBe(7);
  });
  it('refuses anything else', () => {
    for (const bad of ['', '0', '0.00', '-100', '12.345', 'abc', '1e5', '99999999999'])
      expect(parseAmountMinor(bad), bad).toBeNull();
  });
});
