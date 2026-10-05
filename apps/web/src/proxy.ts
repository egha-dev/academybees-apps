import { normalizeRootDomain } from '@academybee/tenant';
import { type NextRequest, NextResponse } from 'next/server';

import { browserPort, classifyRequestHost, platformRootDomain } from './lib/host';
import { apiForwardHeaders, stripInternalHeaders } from './lib/forward-headers';
import { decideRoute } from './lib/routing';
import {
  APEX_HEADER,
  CONTEXT_HEADER,
  type ContextLookup,
  encodeContextHeader,
  lookupTenantContext,
  PATH_HEADER,
} from './lib/tenant-context';

/**
 * Host routing (C-34: `proxy.ts` is Next.js 16's middleware; ARCHITECTURE §4.2, §10.2).
 * - `/api/*` → the API on the same origin, forwarding the browser's host and the shared proxy
 *   secret so the API can trust X-Forwarded-Host (C-46). Client-supplied forwarding headers are
 *   dropped; the client IP comes only from the platform header in TRUSTED_CLIENT_IP_HEADER (M1).
 * - Pages: classify the host (`@academybee/tenant`), look up the academy for tenant/custom hosts,
 *   then rewrite to the experience (`/t/<slug>`, `/console`, `/hub`, marketing), a status page,
 *   or 301 an old slug to the primary host. Internal `x-ab-*` request headers are always
 *   stripped first and only this file sets them.
 */
export async function proxy(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const headers = stripInternalHeaders(request.headers);

  if (request.nextUrl.pathname.startsWith('/api/')) {
    const apiOrigin = process.env.API_ORIGIN;
    const secret = process.env.TRUSTED_PROXY_SECRET;
    if (!apiOrigin || !secret) return new NextResponse(null, { status: 503 });
    const target = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, apiOrigin);
    const apiHeaders = apiForwardHeaders(request.headers, {
      host,
      proto: request.nextUrl.protocol.replace(':', ''),
      secret,
      clientIpHeader: process.env.TRUSTED_CLIENT_IP_HEADER || undefined,
    });
    return NextResponse.rewrite(target, { request: { headers: apiHeaders } });
  }

  const hostClass = classifyRequestHost(host);
  let lookup: ContextLookup | 'unavailable' | undefined;
  if (hostClass.kind === 'custom' && process.env.CUSTOM_DOMAINS_ENABLED !== 'true') {
    // Custom domains are not live yet (PRD v3.1 §G): unknown, without an API call (review M3).
    lookup = { found: false };
  } else if (hostClass.kind === 'tenant' || hostClass.kind === 'custom') {
    lookup = await lookupTenantContext(hostClass.host, {
      apiOrigin: process.env.API_ORIGIN ?? '',
      proxySecret: process.env.TRUSTED_PROXY_SECRET ?? '',
      ...(process.env.TENANT_CONTEXT_CACHE === 'off' ? { cacheMs: { hit: 0, miss: 0 } } : {}),
    }).catch(() => 'unavailable' as const);
  }

  const { pathname, search, protocol } = request.nextUrl;
  // The browser's port (Host header), never the server's internal one (staging/production).
  const port = browserPort(host);
  const decision = decideRoute({ hostClass, pathname, search, port, protocol, lookup });
  if (decision.type === 'redirect') return NextResponse.redirect(decision.location, 301);

  const root = normalizeRootDomain(platformRootDomain());
  headers.set(APEX_HEADER, `${protocol}//${root}${port ? `:${port}` : ''}`);
  headers.set(PATH_HEADER, `${pathname}${search}`.slice(0, 512));
  if (lookup && lookup !== 'unavailable' && lookup.found)
    headers.set(CONTEXT_HEADER, encodeContextHeader(lookup.context));

  if (decision.type === 'next') return NextResponse.next({ request: { headers } });
  const url = request.nextUrl.clone();
  url.pathname = decision.path;
  return NextResponse.rewrite(url, {
    request: { headers },
    ...(decision.status ? { status: decision.status } : {}),
  });
}

export const config = {
  // The manifest and /academy-icon/* go through routing: academy hosts serve their own (ADR-015).
  matcher: ['/((?!_next/static|_next/image|serwist/|icons/|favicon.ico).*)'],
};
