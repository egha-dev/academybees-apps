import { isReservedSlug } from './reserved.js';

/** 3–42 chars, lower-case letters/digits/hyphens, starts and ends alphanumeric (ARCHITECTURE §4.1). */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,40}[a-z0-9])$/;

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 42;

export type SlugProblem =
  'empty' | 'too_short' | 'too_long' | 'format' | 'double_hyphen' | 'reserved';

export type SlugCheck =
  { ok: true; slug: string } | { ok: false; slug: string; problem: SlugProblem };

/** Trim and lower-case a proposed slug (does not otherwise rewrite it). */
export function normalizeSlug(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Is `label` shaped like an academy slug? Used for host classification, where reserved labels
 * are still allowed (a platform-owned tenant may hold one, C-36). No `--` anywhere, which also
 * blocks punycode (`xn--`).
 */
export function isSlugShaped(label: string): boolean {
  return SLUG_PATTERN.test(label) && !label.includes('--');
}

/** Full provisioning check: shape plus the reserved list. */
export function validateSlug(input: string): SlugCheck {
  const slug = normalizeSlug(input);
  if (slug.length === 0) return { ok: false, slug, problem: 'empty' };
  if (slug.length < SLUG_MIN_LENGTH) return { ok: false, slug, problem: 'too_short' };
  if (slug.length > SLUG_MAX_LENGTH) return { ok: false, slug, problem: 'too_long' };
  if (!SLUG_PATTERN.test(slug)) return { ok: false, slug, problem: 'format' };
  if (slug.includes('--')) return { ok: false, slug, problem: 'double_hyphen' };
  if (isReservedSlug(slug)) return { ok: false, slug, problem: 'reserved' };
  return { ok: true, slug };
}
