import { timingSafeEqual } from 'node:crypto';

export const PROXY_SECRET_HEADER = 'x-ab-proxy-secret';

export type HostInput = {
  remoteAddress: string | undefined;
  hostHeader: string | undefined;
  forwardedHost: string | string[] | undefined;
  proxySecret: string | string[] | undefined;
};

export type ProxyTrust = { trustedIps: readonly string[]; secret: string };

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * The host the browser actually used (ARCHITECTURE §4.2). `X-Forwarded-Host` is honoured only
 * when the request comes from a configured proxy IP or carries the shared proxy secret;
 * otherwise a caller could pick any tenant by setting the header. Tenant resolution (Phase 1)
 * uses this value only.
 */
export function effectiveHost(input: HostInput, trust: ProxyTrust): string | undefined {
  const forwarded = Array.isArray(input.forwardedHost)
    ? input.forwardedHost[0]
    : input.forwardedHost;
  const secret = Array.isArray(input.proxySecret) ? input.proxySecret[0] : input.proxySecret;
  const fromTrustedIp =
    input.remoteAddress !== undefined && trust.trustedIps.includes(input.remoteAddress);
  const withSecret = secret !== undefined && safeEqual(secret, trust.secret);
  const raw = forwarded && (fromTrustedIp || withSecret) ? forwarded : input.hostHeader;
  // First value of a comma list, lower-cased, trimmed.
  return raw?.split(',')[0]?.trim().toLowerCase() || undefined;
}
