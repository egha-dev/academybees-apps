import { z } from 'zod';

/**
 * Person names in any script (G-08, G-32): letters (\p{L}) and combining marks (\p{M} — needed
 * for Tamil, Hindi and other Indic scripts), with spaces, apostrophes, dots and hyphens between
 * them. Input is NFC-normalised and whitespace-collapsed; the stored value is exactly that.
 */
const NAME = /^[\p{L}\p{M}](?:[\p{L}\p{M}' .-]*[\p{L}\p{M}.])?$/u;
export const NAME_MAX_LENGTH = 100;

export type NameIssue = 'required' | 'too_long' | 'invalid_characters';

export function normalizeName(input: string): string {
  return input.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

export function validateName(
  input: string,
): { ok: true; value: string } | { ok: false; issue: NameIssue } {
  const value = normalizeName(input);
  if (value.length === 0) return { ok: false, issue: 'required' };
  if ([...value].length > NAME_MAX_LENGTH) return { ok: false, issue: 'too_long' };
  if (!NAME.test(value)) return { ok: false, issue: 'invalid_characters' };
  return { ok: true, value };
}

/** Zod schema for person names (normalises, then validates). */
export const PersonNameSchema = z
  .string()
  .transform(normalizeName)
  .pipe(
    z
      .string()
      .min(1)
      .refine((v) => [...v].length <= NAME_MAX_LENGTH, { message: 'too_long' })
      .regex(NAME, { message: 'invalid_characters' }),
  );
