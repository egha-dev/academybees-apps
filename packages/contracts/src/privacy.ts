/**
 * Privacy helpers shared by API and worker logging (ADR-023) and the analytics PII guard
 * (ADR-032, G-09). Secrets are removed by pino `redact` (REDACT_PATHS); personal contact data
 * that slips into log objects is masked. Logs must be useful without being a PII store.
 */
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9])[A-Za-z0-9.-]*\.([A-Za-z]{2,})/g;
// Indian and international phone numbers: 10+ digits with optional +, spaces or dashes.
const PHONE = /(?<![\w-])(\+?\d[\d\s-]{8,}\d)(?![\w-])/g;
// UUIDs contain digit runs that look like phones; they are never PII in our logs.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function maskEmail(text: string): string {
  return text.replace(
    EMAIL,
    (_m, first: string, domainFirst: string, tld: string) => `${first}***@${domainFirst}***.${tld}`,
  );
}

export function maskPhone(text: string): string {
  return text.replace(PHONE, (match: string) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length < 10) return match;
    return `******${digits.slice(-4)}`;
  });
}

export function maskString(text: string): string {
  if (UUID.test(text)) return text;
  return maskPhone(maskEmail(text));
}

/** Recursively mask strings in a log object (bounded depth; leaves non-plain objects alone). */
export function maskPii<T>(value: T, depth = 0): T {
  if (depth > 6) return value;
  if (typeof value === 'string') return maskString(value) as T;
  if (Array.isArray(value)) return value.map((v: unknown) => maskPii(v, depth + 1)) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = maskPii(v, depth + 1);
    return out as T;
  }
  return value;
}

/** Paths removed from every log line (headers, credentials, tokens). */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-ab-proxy-secret"]',
  'req.headers["idempotency-key"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
  '*.apiKey',
  '*.otp',
];

/** True when a string looks like an email address or a phone number. */
export function looksLikeContactData(text: string): boolean {
  if (UUID.test(text)) return false;
  return maskString(text) !== text;
}
