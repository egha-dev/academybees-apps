import { createHash } from 'node:crypto';

/** Deterministic JSON: object keys sorted recursively, so key order never changes the hash. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** sha256 of method + path (incl. query) + canonical body. */
export function requestHash(method: string, url: string, body: unknown): string {
  return createHash('sha256')
    .update(`${method.toUpperCase()} ${url}\n${canonicalJson(body)}`)
    .digest('hex');
}

const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;

export function isValidIdempotencyKey(key: unknown): key is string {
  return typeof key === 'string' && KEY_PATTERN.test(key);
}
