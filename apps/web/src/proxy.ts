import { type NextRequest, NextResponse } from 'next/server';

import { classifyRequestHost } from './lib/host';

const PROXY_SECRET_HEADER = 'x-ab-proxy-secret';

/**
 * Host routing (C-34: `proxy.ts` is Next.js 16's middleware).
 * - `/api/*` → the API on the same origin (ARCHITECTURE §4.2), forwarding the browser's host
 *   and the shared proxy secret so the API can trust X-Forwarded-Host (C-46). Client-supplied
 *   values of these headers are always overwritten.
 * - Everything else: host classification is a Phase 0 stub; Phase 1 rewrites academy, hub and
 *   console hosts to their route groups.
 */
export function proxy(request: NextRequest) {
  const host = request.headers.get('host') ?? '';

  if (request.nextUrl.pathname.startsWith('/api/')) {
    const apiOrigin = process.env.API_ORIGIN;
    const secret = process.env.TRUSTED_PROXY_SECRET;
    if (!apiOrigin || !secret) return new NextResponse(null, { status: 503 });
    const target = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, apiOrigin);
    const headers = new Headers(request.headers);
    headers.set('x-forwarded-host', host);
    headers.set('x-forwarded-proto', request.nextUrl.protocol.replace(':', ''));
    headers.set(PROXY_SECRET_HEADER, secret);
    return NextResponse.rewrite(target, { request: { headers } });
  }

  const response = NextResponse.next();
  response.headers.set('x-ab-host-kind', classifyRequestHost(host).kind);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|serwist/|icons/|favicon.ico|manifest.webmanifest).*)'],
};
