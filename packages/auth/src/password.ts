import { type Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * Passwords (ADR-007, ARCHITECTURE §6.2): argon2id with memory ≥ 19 MiB, t = 2, p = 1; minimum 8
 * characters (counted in Unicode code points, any script), maximum 128; a strength score for the
 * meter; refuses very common passwords and passwords that contain the user's own identifier.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** `Algorithm.Argon2id` (an ambient const enum, not importable under verbatimModuleSyntax). */
const ARGON2ID = 2 as Algorithm;
const ARGON2 = { algorithm: ARGON2ID, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

/** A small list of the most common passwords (full breached-password checks are optional, §6.2). */
const COMMON = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty123',
  'qwertyuiop',
  'iloveyou',
  'abcd1234',
  'admin123',
  'welcome1',
  'welcome123',
  'letmein1',
  'india123',
  'academy1',
  'academy123',
  '11111111',
  '00000000',
  'asdfghjk',
]);

export type PasswordProblem = 'too_short' | 'too_long' | 'too_common' | 'contains_identifier';

export type PasswordCheck = {
  ok: boolean;
  problems: PasswordProblem[];
  /** 0 (very weak) … 4 (strong), for the strength meter. */
  score: 0 | 1 | 2 | 3 | 4;
};

function normalise(password: string): string {
  return password.normalize('NFC');
}

/** Policy check; `identifiers` are the user's email local part, phone and name parts. */
export function checkPassword(
  password: string,
  identifiers: readonly string[] = [],
): PasswordCheck {
  const value = normalise(password);
  const length = Array.from(value).length;
  const problems: PasswordProblem[] = [];
  if (length < PASSWORD_MIN_LENGTH) problems.push('too_short');
  if (length > PASSWORD_MAX_LENGTH) problems.push('too_long');
  const lower = value.toLocaleLowerCase('en');
  if (COMMON.has(lower)) problems.push('too_common');
  const ids = identifiers
    .map((i) => i.normalize('NFC').toLocaleLowerCase('en').trim())
    .filter((i) => Array.from(i).length >= 4);
  if (ids.some((i) => lower.includes(i))) problems.push('contains_identifier');

  const chars = Array.from(value);
  const classes = [
    chars.some((c) => /\p{Ll}/u.test(c)),
    chars.some((c) => /\p{Lu}/u.test(c)),
    chars.some((c) => /\p{Nd}/u.test(c)),
    chars.some((c) => !/[\p{L}\p{Nd}]/u.test(c)),
    // Letters from another script (Devanagari, Tamil …) count as their own class.
    chars.some((c) => /\p{L}/u.test(c) && !/\p{Script=Latin}/u.test(c)),
  ].filter(Boolean).length;
  let score = 0;
  if (length >= PASSWORD_MIN_LENGTH) score += 1;
  if (length >= 12) score += 1;
  if (length >= 16) score += 1;
  if (classes >= 3) score += 1;
  if (problems.length > 0) score = 0;
  return {
    ok: problems.length === 0,
    problems,
    score: Math.min(score, 4) as PasswordCheck['score'],
  };
}

export function hashPassword(password: string): Promise<string> {
  return hash(normalise(password), ARGON2);
}

/** Verify against a stored hash; false for a malformed hash rather than throwing. */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, normalise(password));
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;
/**
 * Spend the same time as a real verification when the account doesn't exist, so response timing
 * doesn't reveal which identifiers have accounts.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummy ??= hashPassword('not-a-real-password-for-timing');
  await verifyPassword(await dummy, password);
  return false;
}
