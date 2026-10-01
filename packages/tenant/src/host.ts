import { isSlugShaped } from './slug.js';

/**
 * How a request host is served (ARCHITECTURE §5.2, §10.2):
 * - `marketing` — apex or `www.`;
 * - `console` — `console.` (Super Admin, ADR-003);
 * - `hub` — `app.` (Family Hub, ADR-039);
 * - `tenant` — one slug-shaped label under the platform root; `lookupKey` is that label (C-52);
 * - `custom` — any other valid hostname (future verified custom domains); `lookupKey` is the host;
 * - `invalid` — IPs, punycode, nested labels under the root, malformed hosts.
 */
export type HostClass =
  | { kind: 'marketing'; host: string }
  | { kind: 'console'; host: string }
  | { kind: 'hub'; host: string }
  | { kind: 'tenant'; host: string; lookupKey: string }
  | { kind: 'custom'; host: string; lookupKey: string }
  | { kind: 'invalid'; host: string | null };

export type HostKind = HostClass['kind'];

const MAX_HOST_LENGTH = 253;
const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Lower-case, trim, drop the port and a trailing dot. Returns `null` for anything that is not a
 * plain DNS name: IP literals, bracketed IPv6, empty labels, bad characters, over-long names.
 */
export function normalizeHost(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  let host = raw.trim().toLowerCase();
  if (host.startsWith('[')) return null; // IPv6 literal
  const colon = host.indexOf(':');
  if (colon !== -1) {
    const port = host.slice(colon + 1);
    if (!/^\d{1,5}$/.test(port)) return null;
    host = host.slice(0, colon);
  }
  if (host.endsWith('.')) host = host.slice(0, -1);
  if (host.length === 0 || host.length > MAX_HOST_LENGTH) return null;
  const labels = host.split('.');
  if (!labels.every((label) => LABEL_PATTERN.test(label))) return null;
  // A numeric last label means an IPv4 literal (or nonsense); real TLDs are alphabetic.
  if (/^\d+$/.test(labels[labels.length - 1] ?? '')) return null;
  return host;
}

/** Normalise the configured root domain (`academybee.com`, `staging.academybee.com`, `localhost`). */
export function normalizeRootDomain(root: string): string {
  const normalized = normalizeHost(root);
  if (!normalized) throw new Error(`Invalid platform root domain: ${JSON.stringify(root)}`);
  return normalized;
}

/** Classify a request host against the platform root domain. Never throws. */
export function classifyHost(raw: string | null | undefined, rootDomain: string): HostClass {
  const host = normalizeHost(raw);
  if (!host) return { kind: 'invalid', host: null };
  const root = normalizeRootDomain(rootDomain);

  if (host === root || host === `www.${root}`) return { kind: 'marketing', host };
  if (host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -(root.length + 1));
    if (sub.includes('.')) return { kind: 'invalid', host }; // nested: a.b.academybee.com
    if (sub === 'console') return { kind: 'console', host };
    if (sub === 'app') return { kind: 'hub', host };
    if (!isSlugShaped(sub)) return { kind: 'invalid', host };
    return { kind: 'tenant', host, lookupKey: sub };
  }
  // Anything else is a candidate custom domain: needs a dot, no punycode.
  if (!host.includes('.') || host.split('.').some((label) => label.startsWith('xn--'))) {
    return { kind: 'invalid', host };
  }
  return { kind: 'custom', host, lookupKey: host };
}

/** Public URL origin of a tenant label under the root (protocol and port from the caller). */
export function tenantHost(label: string, rootDomain: string): string {
  return `${label}.${normalizeRootDomain(rootDomain)}`;
}
