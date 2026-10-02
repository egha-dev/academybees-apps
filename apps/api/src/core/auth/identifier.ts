/**
 * Sign-in identifiers (C-65): an email (lower-cased, NFC) or a phone in E.164. A 10-digit Indian
 * mobile number (starting 6–9) is read as +91. Anything else is not an identifier.
 */
export type Identifier = { kind: 'email'; value: string } | { kind: 'phone'; value: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function normalizeIdentifier(raw: string): Identifier | null {
  const value = raw.normalize('NFC').trim();
  if (value.includes('@')) {
    const email = value.toLowerCase();
    return EMAIL.test(email) && email.length <= 320 ? { kind: 'email', value: email } : null;
  }
  const digits = value.replace(/[\s()-]/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) return { kind: 'phone', value: `+91${digits}` };
  if (/^0[6-9]\d{9}$/.test(digits)) return { kind: 'phone', value: `+91${digits.slice(1)}` };
  if (/^\+[1-9]\d{6,14}$/.test(digits)) return { kind: 'phone', value: digits };
  return null;
}
