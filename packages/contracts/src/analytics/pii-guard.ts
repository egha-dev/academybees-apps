import { looksLikeContactData } from '../privacy.js';

/**
 * Analytics PII guard (ADR-032, G-09): product analytics never receive personal data. Events
 * are rejected when a property *key* names personal data or a *value* looks like an email,
 * a phone number or free text.
 */
const PERSONAL_KEY_PARTS = new Set([
  'name',
  'email',
  'phone',
  'mobile',
  'whatsapp',
  'address',
  'dob',
  'birthday',
  'birthdate',
  'password',
  'token',
  'aadhaar',
  'pan',
  'ip',
]);
const FREE_TEXT_MAX = 120;

function keyParts(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function findPii(properties: unknown, path = ''): string[] {
  if (typeof properties === 'string') {
    if (looksLikeContactData(properties))
      return [`${path || '(value)'}: looks like an email or phone number`];
    if (properties.length > FREE_TEXT_MAX)
      return [`${path || '(value)'}: free text is not allowed`];
    return [];
  }
  if (Array.isArray(properties)) return properties.flatMap((v, i) => findPii(v, `${path}[${i}]`));
  if (properties && typeof properties === 'object') {
    return Object.entries(properties).flatMap(([key, value]) => {
      const here = path ? `${path}.${key}` : key;
      const personal = keyParts(key).some((part) => PERSONAL_KEY_PARTS.has(part));
      return [
        ...(personal ? [`${here}: property name suggests personal data`] : []),
        ...findPii(value, here),
      ];
    });
  }
  return [];
}

export class AnalyticsPiiError extends Error {
  constructor(
    readonly event: string,
    readonly problems: string[],
  ) {
    super(`Analytics event "${event}" rejected by the PII guard: ${problems.join('; ')}`);
    this.name = 'AnalyticsPiiError';
  }
}

export function assertNoPii(event: string, properties: unknown): void {
  const problems = findPii(properties);
  if (problems.length > 0) throw new AnalyticsPiiError(event, problems);
}
