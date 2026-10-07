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

/**
 * Keys whose values are secrets wherever they appear in a log object, at any depth (review L2;
 * pino's `redact` paths only reach fixed depths). Compared case-insensitively.
 */
const SECRET_KEYS = new Set(
  [
    'password',
    'currentPassword',
    'newPassword',
    'passwordHash',
    'token',
    'accessToken',
    'refreshToken',
    'sealedToken',
    'secret',
    'secretEncrypted',
    'clientSecret',
    'apiKey',
    'otp',
    'recoveryCode',
    'recoveryCodes',
    'manualKey',
    'qrSvgDataUrl',
    'authorization',
    'cookie',
    'set-cookie',
    'x-ab-proxy-secret',
    'x-csrf-token',
    'idempotency-key',
  ].map((k) => k.toLowerCase()),
);

/**
 * A log-safe view of an Error (review L1): its name, a masked message and stack, a string `code`,
 * and the same for its `cause`. Every other property is dropped — Prisma's `meta` can hold
 * column values, and driver errors carry SQL. Prisma messages quote the query's arguments, so
 * only the error's name and code are kept for them.
 */
export function safeError(error: Error, depth = 0): Record<string, unknown> {
  const code = (error as { code?: unknown }).code;
  const isPrisma = error.name.startsWith('Prisma');
  const out: Record<string, unknown> = {
    type: error.name,
    message: isPrisma
      ? `${error.name}${typeof code === 'string' ? ` ${code}` : ''}`
      : maskString(error.message),
    ...(typeof code === 'string' ? { code } : {}),
  };
  if (!isPrisma && error.stack) out.stack = maskString(error.stack);
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error && depth < 3) out.cause = safeError(cause, depth + 1);
  return out;
}

/**
 * Everything a log line may contain (API and worker `formatters.log`): secrets removed by key at
 * any depth, Errors reduced to `safeError`, contact data masked (ADR-023, ADR-032).
 */
export function safeLogObject<T>(value: T, depth = 0): T {
  if (depth > 8) return value;
  if (value instanceof Error) return safeError(value) as T;
  if (typeof value === 'string') return maskString(value) as T;
  if (Array.isArray(value)) return value.map((v: unknown) => safeLogObject(v, depth + 1)) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value))
      out[k] = SECRET_KEYS.has(k.toLowerCase()) ? '[redacted]' : safeLogObject(v, depth + 1);
    return out as T;
  }
  return value;
}

/** A request URL for logs: the path only — query strings can carry tokens or contact data (L2). */
export function logSafeUrl(url: string | undefined): string | undefined {
  return url?.split('?')[0];
}

/** True when a string looks like an email address or a phone number. */
export function looksLikeContactData(text: string): boolean {
  if (UUID.test(text)) return false;
  return maskString(text) !== text;
}
