import { describe, expect, it } from 'vitest';

import { maskPii, maskString } from './pii-mask.js';

describe('log PII masking', () => {
  it('masks emails', () => {
    expect(maskString('invite sent to priya.sharma@example.co.in')).toBe(
      'invite sent to p***@e***.in',
    );
  });

  it('masks Indian and international phone numbers, keeping the last 4 digits', () => {
    expect(maskString('call 9876543210 now')).toBe('call ******3210 now');
    expect(maskString('+91 98765 43210')).toBe('******3210');
    expect(maskString('+44-20-7946-0958')).toBe('******0958');
  });

  it('leaves UUIDs, short numbers and ordinary text alone', () => {
    const id = '0199a0a0-1234-7000-8000-123456789012';
    expect(maskString(id)).toBe(id);
    expect(maskString('invoice 12345 for ₹1,00,000')).toBe('invoice 12345 for ₹1,00,000');
  });

  it('masks nested log objects', () => {
    expect(maskPii({ msg: 'x', user: { email: 'a@b.io', phones: ['9876543210'] }, n: 5 })).toEqual({
      msg: 'x',
      user: { email: 'a***@b***.io', phones: ['******3210'] },
      n: 5,
    });
  });
});
