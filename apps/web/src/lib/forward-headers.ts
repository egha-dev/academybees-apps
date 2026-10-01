/**
 * Request headers for the `/api/*` rewrite to the API (ARCHITECTURE §4.2, C-46). Pure so it can be
 * unit-tested. The API trusts X-Forwarded-Host / X-Forwarded-For only when the proxy secret is
 * present, so everything a browser could forge is removed here first:
 * - internal `x-ab-*` headers;
 * - `X-Forwarded-For`, `Forwarded`, `X-Real-IP` (Next only fills X-Forwarded-For when absent,
 *   so a client value would otherwise pass through with our secret attached — review M1).
 * The client IP is then set only from the platform header named by `clientIpHeader` (Vercel
 * overwrites `x-real-ip` with the real client address); without one the API uses the socket.
 */
const IP = /^[0-9a-fA-F:.]{2,45}$/;

export function apiForwardHeaders(
  incoming: Headers,
  options: { host: string; proto: string; secret: string; clientIpHeader?: string | undefined },
): Headers {
  const trustedIp = options.clientIpHeader
    ? incoming.get(options.clientIpHeader)?.split(',')[0]?.trim()
    : undefined;
  const headers = new Headers(incoming);
  for (const name of [...headers.keys()]) {
    if (
      name.startsWith('x-ab-') ||
      name === 'x-forwarded-for' ||
      name === 'forwarded' ||
      name === 'x-real-ip'
    )
      headers.delete(name);
  }
  headers.set('x-forwarded-host', options.host);
  headers.set('x-forwarded-proto', options.proto);
  headers.set('x-ab-proxy-secret', options.secret);
  if (trustedIp && IP.test(trustedIp)) headers.set('x-forwarded-for', trustedIp);
  return headers;
}

/** Page requests: strip internal headers a browser could send; only proxy.ts sets them. */
export function stripInternalHeaders(incoming: Headers): Headers {
  const headers = new Headers(incoming);
  for (const name of [...headers.keys()]) if (name.startsWith('x-ab-')) headers.delete(name);
  return headers;
}
