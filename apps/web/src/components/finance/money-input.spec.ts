import { describe, expect, it } from 'vitest';

import { majorText, minorFromText } from './money-input';

describe('minorFromText', () => {
  it.each([
    ['1500', 150_000],
    ['1,500', 150_000],
    ['1,00,000', 10_000_000],
    ['₹ 1,500.50', 150_050],
    ['0.05', 5],
    ['19.9', 1_990],
    ['0.29', 29],
    ['1.', 100],
  ])('%s → %i', (text, minor) => expect(minorFromText(text)).toBe(minor));

  it.each(['', 'abc', '-5', '1.234', '1.2.3', '1e5'])('refuses %j', (text) =>
    expect(minorFromText(text)).toBeNull(),
  );

  it('honours a currency without decimals', () => {
    expect(minorFromText('1500', 0)).toBe(1500);
    expect(minorFromText('1500.5', 0)).toBeNull();
  });
});

describe('majorText', () => {
  it('round-trips', () => {
    for (const minor of [0, 5, 29, 1_990, 150_000, 150_050, 10_000_000])
      expect(minorFromText(majorText(minor))).toBe(minor);
    expect(majorText(150_000)).toBe('1500');
    expect(majorText(150_050)).toBe('1500.50');
  });
});
