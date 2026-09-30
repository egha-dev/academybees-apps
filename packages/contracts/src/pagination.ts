import { z } from 'zod';

/** Keyset pagination (ADR-026, ARCHITECTURE §9.1): `?limit=&cursor=` → `{ items, nextCursor }`. */
export const PAGE_LIMIT_DEFAULT = 25;
export const PAGE_LIMIT_MAX = 100;

export const CursorPageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
  cursor: z.string().min(1).max(512).optional(),
});
export type CursorPageQuery = z.infer<typeof CursorPageQuerySchema>;

export function cursorPageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}

export type CursorPage<T> = { items: T[]; nextCursor: string | null };

/** Opaque cursor: base64url(JSON of the sort keys of the last item). Works in Node and browsers. */
export function encodeCursor(keys: Record<string, string | number>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(keys));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decode and validate a cursor against the endpoint's key schema.
 * Returns `null` for anything malformed; the caller answers `VALIDATION_FAILED`.
 */
export function decodeCursor<T extends z.ZodType>(cursor: string, keys: T): z.infer<T> | null {
  try {
    const base64 = cursor.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const parsed = keys.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
