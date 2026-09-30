import { createHmac } from 'node:crypto';

/** Pseudonymous, stable ID for analytics: HMAC-SHA256(salt, id), truncated. Irreversible without the salt. */
export function hashId(salt: string, kind: 'u' | 't', id: string): string {
  return `${kind}_${createHmac('sha256', salt).update(`${kind}:${id}`).digest('hex').slice(0, 32)}`;
}
