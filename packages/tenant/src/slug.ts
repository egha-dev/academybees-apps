import { isImpersonatingSlug, isReservedSlug } from './reserved.js';

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

/** Full provisioning check: shape, the reserved list and the impersonation list (C-88). */
export function validateSlug(input: string): SlugCheck {
  const slug = normalizeSlug(input);
  if (slug.length === 0) return { ok: false, slug, problem: 'empty' };
  if (slug.length < SLUG_MIN_LENGTH) return { ok: false, slug, problem: 'too_short' };
  if (slug.length > SLUG_MAX_LENGTH) return { ok: false, slug, problem: 'too_long' };
  if (!SLUG_PATTERN.test(slug)) return { ok: false, slug, problem: 'format' };
  if (slug.includes('--')) return { ok: false, slug, problem: 'double_hyphen' };
  if (isReservedSlug(slug) || isImpersonatingSlug(slug))
    return { ok: false, slug, problem: 'reserved' };
  return { ok: true, slug };
}

/**
 * A slug proposal from an academy name: Latin letters with accents folded, digits and hyphens;
 * other scripts drop out (the owner can type one). Empty when nothing usable remains.
 */
export function slugFromName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, '');
}

/**
 * Alternatives to offer when `base` is taken (C-88), most natural first. Each is shaped and not
 * reserved; the caller checks availability.
 */
export function slugAlternatives(base: string): string[] {
  const root = normalizeSlug(base)
    .slice(0, SLUG_MAX_LENGTH - 8)
    .replace(/-+$/, '');
  if (!root) return [];
  const candidates = [`${root}-academy`, `the-${root}`, `${root}-classes`];
  for (let n = 2; n <= 9; n++) candidates.push(`${root}${n}`);
  return candidates.filter((c) => validateSlug(c).ok && c !== base);
}
