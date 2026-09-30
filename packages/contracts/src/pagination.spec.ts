import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import {
  CursorPageQuerySchema,
  cursorPageSchema,
  decodeCursor,
  encodeCursor,
  PAGE_LIMIT_DEFAULT,
} from './pagination.js';

describe('CursorPageQuerySchema', () => {
  it('defaults and coerces the limit', () => {
    expect(CursorPageQuerySchema.parse({})).toEqual({ limit: PAGE_LIMIT_DEFAULT });
    expect(CursorPageQuerySchema.parse({ limit: '10', cursor: 'abc' })).toEqual({
      limit: 10,
      cursor: 'abc',
    });
  });

  it('rejects limits outside 1..100', () => {
    expect(CursorPageQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(CursorPageQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(CursorPageQuerySchema.safeParse({ limit: 2.5 }).success).toBe(false);
  });
});

describe('cursor encoding', () => {
  const keys = z.object({ createdAt: z.string(), id: z.string() });

  it('round-trips sort keys, including non-ASCII values', () => {
    const value = { createdAt: '2026-09-30T10:00:00.000Z', id: 'ஆரவ்-आरव' };
    const cursor = encodeCursor(value);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(cursor, keys)).toEqual(value);
  });

  it('returns null for tampered or malformed cursors', () => {
    expect(decodeCursor('%%%', keys)).toBeNull();
    expect(decodeCursor(encodeCursor({ other: 1 }), keys)).toBeNull();
  });

  it('builds page response schemas', () => {
    const page = cursorPageSchema(z.object({ id: z.string() }));
    expect(page.parse({ items: [{ id: 'a' }], nextCursor: null })).toEqual({
      items: [{ id: 'a' }],
      nextCursor: null,
    });
  });
});
