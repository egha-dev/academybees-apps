import { describe, expect, it } from 'vitest';

import { checkPassword, hashPassword, verifyAgainstDummy, verifyPassword } from './password.js';

describe('password policy', () => {
  it.each([
    ['short', 'abc123', ['too_short']],
    ['common', 'password123', ['too_common']],
    ['contains the email name', 'priyasharma2026', ['contains_identifier']],
  ] as const)('rejects a %s password', (_, password, problems) => {
    expect(checkPassword(password, ['priyasharma', 'Priya Sharma'])).toMatchObject({
      ok: false,
      problems,
      score: 0,
    });
  });

  it('counts characters in any script (8 Tamil letters are long enough)', () => {
    expect(checkPassword('அகடமிபீதமி').ok).toBe(true);
    expect(checkPassword('ஆரவ்').problems).toEqual(['too_short']);
  });

  it('scores longer, more varied passwords higher', () => {
    const weak = checkPassword('pineapple').score;
    const strong = checkPassword('Mango-Season-2026!').score;
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBe(4);
  });

  it('rejects over-long input', () => {
    expect(checkPassword('a'.repeat(129)).problems).toContain('too_long');
  });
});

describe('argon2id hashing', () => {
  it('hashes with argon2id ≥ 19 MiB, t=2, p=1 and verifies', async () => {
    const hash = await hashPassword('Mango-Season-2026!');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(hash, 'Mango-Season-2026!')).toBe(true);
    expect(await verifyPassword(hash, 'mango-season-2026!')).toBe(false);
  });

  it('normalises Unicode before hashing (NFC vs NFD of the same text)', async () => {
    const hash = await hashPassword('Café-Mango-26');
    expect(await verifyPassword(hash, 'Café-Mango-26')).toBe(true);
  });

  it('never throws on a malformed stored hash; dummy verification returns false', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
    expect(await verifyAgainstDummy('anything')).toBe(false);
  });
});
