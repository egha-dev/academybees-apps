import { describe, expect, it } from 'vitest';

import { AnalyticsPiiError, assertNoPii, findPii } from './pii-guard.js';

describe('analytics PII guard (G-09)', () => {
  it('rejects email and phone properties by key (exit gate)', () => {
    expect(() => assertNoPii('x.y', { email: 'redacted' })).toThrow(AnalyticsPiiError);
    expect(() => assertNoPii('x.y', { phone: 'redacted' })).toThrow(AnalyticsPiiError);
    expect(findPii({ parentMobile: 'x', studentFirstName: 'x', guardian_email: 'x' })).toHaveLength(
      3,
    );
  });

  it('rejects email- and phone-shaped values under innocent keys (exit gate)', () => {
    expect(findPii({ note: 'priya@example.com' })).toEqual([
      'note: looks like an email or phone number',
    ]);
    expect(findPii({ ref: '+91 98765 43210' })).toEqual([
      'ref: looks like an email or phone number',
    ]);
    expect(findPii({ nested: { list: ['9876543210'] } })).toEqual([
      'nested.list[0]: looks like an email or phone number',
    ]);
  });

  it('rejects free text', () => {
    expect(findPii({ comment: 'x'.repeat(121) })).toHaveLength(1);
  });

  it('allows ordinary product properties', () => {
    expect(
      findPii({
        academyType: 'dance',
        studentsCount: 42,
        offline: true,
        method: 'upi',
        plan: null,
        step: 'batch',
      }),
    ).toEqual([]);
  });
});
