import { randomInt } from 'node:crypto';

import { Secret, TOTP } from 'otpauth';
import QRCode from 'qrcode';

import { hashToken } from './tokens.js';

/**
 * TOTP second factor (RFC 6238; G-11, C-66): 6 digits, 30-second steps, ±1 step of clock drift.
 * A code is accepted only for a step later than the last accepted one (no replay).
 */
const PERIOD = 30;
const DIGITS = 6;

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

/** `otpauth://` URI for authenticator apps (shown as a QR code + manual key). */
export function totpUri(secretBase32: string, account: string, issuer = 'AcademyBee'): string {
  return new TOTP({
    issuer,
    label: account,
    secret: Secret.fromBase32(secretBase32),
    digits: DIGITS,
    period: PERIOD,
  }).toString();
}

export type TotpResult = { ok: true; step: number } | { ok: false };

export function verifyTotp(
  secretBase32: string,
  code: string,
  options: { lastStep?: number | null; now?: number } = {},
): TotpResult {
  const clean = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return { ok: false };
  const totp = new TOTP({
    secret: Secret.fromBase32(secretBase32),
    digits: DIGITS,
    period: PERIOD,
  });
  const now = options.now ?? Date.now();
  const delta = totp.validate({ token: clean, timestamp: now, window: 1 });
  if (delta === null) return { ok: false };
  const step = Math.floor(now / 1000 / PERIOD) + delta;
  if (options.lastStep !== undefined && options.lastStep !== null && step <= options.lastStep)
    return { ok: false };
  return { ok: true, step };
}

/** Current code for a secret (tests and E2E only). */
export function totpCode(secretBase32: string, now = Date.now()): string {
  return new TOTP({
    secret: Secret.fromBase32(secretBase32),
    digits: DIGITS,
    period: PERIOD,
  }).generate({ timestamp: now });
}

const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Ten single-use recovery codes like `k7mp-x2qd`, shown once; only their hashes are stored. */
export function generateRecoveryCodes(count = 10): string[] {
  const part = () =>
    Array.from({ length: 4 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join(
      '',
    );
  return Array.from({ length: count }, () => `${part()}-${part()}`);
}

export function hashRecoveryCode(code: string): string {
  return hashToken(code.trim().toLowerCase().replace(/[\s-]/g, ''));
}

/** The secret as an SVG QR code data URL for `<img>` (no script, no external request). */
export async function totpQrSvgDataUrl(uri: string): Promise<string> {
  const svg = await QRCode.toString(uri, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/** The base32 secret in groups of four, easier to type into an authenticator app. */
export function formatManualKey(secretBase32: string): string {
  return secretBase32.replace(/(.{4})/g, '$1 ').trim();
}
