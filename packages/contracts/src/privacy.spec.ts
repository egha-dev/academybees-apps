import { describe, expect, it } from 'vitest';

import {
  logSafeUrl,
  looksLikeContactData,
  maskPii,
  maskString,
  safeError,
  safeLogObject,
} from './privacy.js';

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

describe('looksLikeContactData', () => {
  it('detects emails and phones only', () => {
    expect(looksLikeContactData('a@b.co')).toBe(true);
    expect(looksLikeContactData('98765 43210')).toBe(true);
    expect(looksLikeContactData('attendance.session_marked')).toBe(false);
    expect(looksLikeContactData('0199a0a0-1234-7000-8000-123456789012')).toBe(false);
  });
});

describe('log safety (review L1, L2)', () => {
  it('removes secrets by key at any depth', () => {
    const out = safeLogObject({
      msg: 'x',
      body: { user: { password: 'hunter2', profile: { recoveryCodes: ['a', 'b'] } } },
      headers: { Cookie: 'ab_at=x', 'Idempotency-Key': 'k' },
      list: [{ token: 't' }],
    });
    expect(out).toEqual({
      msg: 'x',
      body: { user: { password: '[redacted]', profile: { recoveryCodes: '[redacted]' } } },
      headers: { Cookie: '[redacted]', 'Idempotency-Key': '[redacted]' },
      list: [{ token: '[redacted]' }],
    });
  });

  it('reduces errors to a masked summary and drops Prisma meta and arguments', () => {
    const plain = Object.assign(new Error('no user priya@example.com'), { code: 'E1', extra: 'x' });
    const summary = safeError(plain);
    expect(summary).toMatchObject({ type: 'Error', message: 'no user p***@e***.com', code: 'E1' });
    expect(summary).not.toHaveProperty('extra');
    expect(String(summary.stack)).not.toContain('priya@example.com');

    class PrismaClientKnownRequestError extends Error {
      code = 'P2002';
      meta = { target: ['email'], value: 'priya@example.com' };
    }
    const prisma = new PrismaClientKnownRequestError(
      'Invalid `prisma.user.create()` { email: "priya@example.com" }',
    );
    prisma.name = 'PrismaClientKnownRequestError';
    const p = safeError(prisma);
    expect(p).toEqual({
      type: 'PrismaClientKnownRequestError',
      message: 'PrismaClientKnownRequestError P2002',
      code: 'P2002',
    });
    expect(safeLogObject({ err: prisma })).toEqual({ err: p });
  });

  it('logs URLs without their query string', () => {
    expect(logSafeUrl('/api/v1/invitations/abc?token=secret&email=a@b.co')).toBe(
      '/api/v1/invitations/abc',
    );
    expect(logSafeUrl(undefined)).toBeUndefined();
  });
});
