import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export const PROXY_SECRET_HEADER = 'x-ab-proxy-secret';

export type HostInput = {
  remoteAddress: string | undefined;
  hostHeader: string | undefined;
  forwardedHost: string | string[] | undefined;
  proxySecret: string | string[] | undefined;
  /** `X-Forwarded-For`, for the client IP (review M4). */
  forwardedFor?: string | string[] | undefined;
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
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Did the request come through our proxy (configured IP or the shared secret, C-46)? */
export function fromTrustedProxy(input: HostInput, trust: ProxyTrust): boolean {
  const secret = first(input.proxySecret);
  const fromTrustedIp =
    input.remoteAddress !== undefined && trust.trustedIps.includes(input.remoteAddress);
  return fromTrustedIp || (secret !== undefined && safeEqual(secret, trust.secret));
}

export function effectiveHost(input: HostInput, trust: ProxyTrust): string | undefined {
  const forwarded = first(input.forwardedHost);
  const raw = forwarded && fromTrustedProxy(input, trust) ? forwarded : input.hostHeader;
  // First value of a comma list, lower-cased, trimmed.
  return raw?.split(',')[0]?.trim().toLowerCase() || undefined;
}

/**
 * The client IP for audit and rate limits (review M4). Behind our proxy it is the left-most
 * `X-Forwarded-For` entry (the proxy overwrites the header with what it saw); otherwise the socket
 * address. Anything that is not an IP literal is ignored, so the value is safe to log.
 */
export function clientIp(input: HostInput, trust: ProxyTrust): string | undefined {
  if (fromTrustedProxy(input, trust)) {
    const candidate = first(input.forwardedFor)?.split(',')[0]?.trim();
    if (candidate && isIP(candidate)) return candidate;
  }
  const socket = input.remoteAddress?.replace(/^::ffff:/, '');
  return socket && isIP(socket) ? socket : undefined;
}
