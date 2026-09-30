import { describe, expect, it } from 'vitest';

import { backoffBase, backoffDelay, BACKOFF_CAP_MS } from './backoff.js';

describe('backoff schedule (exit gate)', () => {
  it('doubles from 2 s and caps at 5 min', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20].map(backoffBase)).toEqual([
      2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 256_000, 300_000, 300_000, 300_000,
    ]);
  });

  it('jitters between half and all of the base', () => {
    expect(backoffDelay(3, () => 0)).toBe(4_000);
    expect(backoffDelay(3, () => 1)).toBe(8_000);
    expect(backoffDelay(3, () => 0.5)).toBe(6_000);
    for (let i = 0; i < 200; i++) {
      const d = backoffDelay(12);
      expect(d).toBeGreaterThanOrEqual(BACKOFF_CAP_MS / 2);
      expect(d).toBeLessThanOrEqual(BACKOFF_CAP_MS);
    }
  });
});
