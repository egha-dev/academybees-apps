import { describe, expect, it } from 'vitest';

import { isUuidV7, newId, UuidV7Schema } from './ids.js';

describe('ids', () => {
  it('generates UUIDv7 values that sort by creation time', () => {
    const ids = Array.from({ length: 50 }, () => newId());
    expect(ids.every(isUuidV7)).toBe(true);
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rejects other UUID versions and garbage', () => {
    expect(isUuidV7('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
    expect(isUuidV7('not-a-uuid')).toBe(false);
    expect(UuidV7Schema.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(false);
    expect(UuidV7Schema.safeParse(newId()).success).toBe(true);
  });
});
