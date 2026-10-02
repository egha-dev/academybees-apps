import { describe, expect, it } from 'vitest';

import { cookieSpecs, csrfMatches, generateCsrfToken, REFRESH_COOKIE_PATH } from './cookies.js';
import { decryptSecret, encryptSecret, generateMasterKey, loadMasterKeys } from './secrets.js';
import { generateToken, hashToken, safeEqual } from './tokens.js';
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  totpCode,
  totpUri,
  verifyTotp,
} from './totp.js';

describe('opaque tokens', () => {
  it('are 256-bit base64url and stored only as SHA-256', () => {
    const t = generateToken();
    expect(Buffer.from(t, 'base64url')).toHaveLength(32);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
  });

  it('compare in constant time', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('cookies (ARCHITECTURE §6.2)', () => {
  it('use __Host-/__Secure- prefixes, host-only, Lax, and the refresh path', () => {
    const c = cookieSpecs('secure');
    expect(c.access).toMatchObject({
      name: '__Host-ab_at',
      options: { httpOnly: true, secure: true, sameSite: 'lax', path: '/' },
    });
    expect(c.refresh).toMatchObject({
      name: '__Secure-ab_rt',
      options: { httpOnly: true, path: REFRESH_COOKIE_PATH },
    });
    expect(c.csrf).toMatchObject({
      name: '__Host-ab_csrf',
      options: { httpOnly: false, secure: true },
    });
    for (const spec of Object.values(c)) expect(spec.options).not.toHaveProperty('domain');
  });

  it('drop prefixes and Secure only in the insecure dev mode (C-64)', () => {
    expect(cookieSpecs('insecure-dev').access).toMatchObject({
      name: 'ab_at',
      options: { secure: false },
    });
  });

  it('CSRF double-submit needs both values, equal', () => {
    const t = generateCsrfToken();
    expect(csrfMatches(t, t)).toBe(true);
    expect(csrfMatches(t, undefined)).toBe(false);
    expect(csrfMatches(undefined, t)).toBe(false);
    expect(csrfMatches(t, generateCsrfToken())).toBe(false);
    expect(csrfMatches('short', 'short')).toBe(false);
  });
});

describe('TOTP (G-11, C-66)', () => {
  const secret = generateTotpSecret();
  const now = Date.UTC(2026, 9, 2, 10, 0, 0);

  it('accepts the current code and ±1 step of drift, not two steps', () => {
    expect(verifyTotp(secret, totpCode(secret, now), { now })).toMatchObject({ ok: true });
    expect(verifyTotp(secret, totpCode(secret, now - 30_000), { now }).ok).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, now - 90_000), { now }).ok).toBe(false);
    expect(verifyTotp(secret, 'abcdef', { now }).ok).toBe(false);
  });

  it('refuses replay of the same step', () => {
    const first = verifyTotp(secret, totpCode(secret, now), { now });
    expect(first.ok).toBe(true);
    const step = first.ok ? first.step : 0;
    expect(verifyTotp(secret, totpCode(secret, now), { now, lastStep: step }).ok).toBe(false);
  });

  it('builds an otpauth URI and single-use recovery codes', () => {
    expect(totpUri(secret, 'owner@demo-a.test')).toMatch(
      /^otpauth:\/\/totp\/AcademyBee:owner%40demo-a\.test\?/,
    );
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(hashRecoveryCode(codes[0]!.toUpperCase())).toBe(hashRecoveryCode(codes[0]!));
  });
});

describe('secret encryption (ADR-033, C-62)', () => {
  const ring = loadMasterKeys(generateMasterKey('m1'));

  it('round-trips and never contains the plaintext', () => {
    const sealed = encryptSecret('JBSWY3DPEHPK3PXP', ring);
    expect(sealed.startsWith('ab1.m1.')).toBe(true);
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(sealed, ring)).toBe('JBSWY3DPEHPK3PXP');
    expect(encryptSecret('x', ring)).not.toBe(encryptSecret('x', ring));
  });

  it('fails on tampering or an unknown key, and decrypts with a rotated ring', () => {
    const sealed = encryptSecret('secret', ring);
    const parts = sealed.split('.');
    parts[4] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), ring)).toThrow();
    expect(() => decryptSecret(sealed, loadMasterKeys(generateMasterKey('m2')))).toThrow(
      /unknown master key/,
    );
    const rotated = loadMasterKeys(
      `${generateMasterKey('m2')},${generateMasterKey('m1').replace(/^m1:.*/, `m1:${ring.keys.get('m1')!.toString('base64')}`)}`,
    );
    expect(decryptSecret(sealed, rotated)).toBe('secret');
  });

  it('validates the key format', () => {
    expect(() => loadMasterKeys('m1:short')).toThrow();
    expect(() => loadMasterKeys('')).toThrow();
  });
});
