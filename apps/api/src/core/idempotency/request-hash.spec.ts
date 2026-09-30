import { describe, expect, it } from 'vitest';

import { canonicalJson, isValidIdempotencyKey, requestHash } from './request-hash.js';

describe('request hashing', () => {
  it('ignores object key order', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[1,{"x":1,"y":2}]},"b":1}',
    );
    expect(requestHash('POST', '/api/v1/x', { a: 1, b: 2 })).toBe(
      requestHash('post', '/api/v1/x', { b: 2, a: 1 }),
    );
  });

  it('changes with body, method or path', () => {
    const h = requestHash('POST', '/p', { amountMinor: 100 });
    expect(requestHash('POST', '/p', { amountMinor: 101 })).not.toBe(h);
    expect(requestHash('PUT', '/p', { amountMinor: 100 })).not.toBe(h);
    expect(requestHash('POST', '/q', { amountMinor: 100 })).not.toBe(h);
  });

  it('accepts UUIDs and similar tokens as keys, rejects junk', () => {
    expect(isValidIdempotencyKey('0199a0a0-0000-7000-8000-000000000000')).toBe(true);
    expect(isValidIdempotencyKey('short')).toBe(false);
    expect(isValidIdempotencyKey('has spaces in it')).toBe(false);
    expect(isValidIdempotencyKey(undefined)).toBe(false);
  });
});
