import { describe, expect, it } from 'vitest';

import { resolveRequestId } from './request-context.js';

describe('resolveRequestId', () => {
  const gen = () => 'generated-id';

  it('keeps a safe caller-supplied ID', () => {
    expect(resolveRequestId('0199a0a0-0000-7000-8000-000000000000', gen)).toBe(
      '0199a0a0-0000-7000-8000-000000000000',
    );
  });

  it('replaces missing, short, long or unsafe IDs', () => {
    expect(resolveRequestId(undefined, gen)).toBe('generated-id');
    expect(resolveRequestId('short', gen)).toBe('generated-id');
    expect(resolveRequestId('x'.repeat(101), gen)).toBe('generated-id');
    expect(resolveRequestId('abc\ninjected-log-line', gen)).toBe('generated-id');
    expect(resolveRequestId(['a', 'b'], gen)).toBe('generated-id');
  });
});
