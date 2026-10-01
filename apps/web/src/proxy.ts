import { normalizeRootDomain } from '@academybee/tenant';
import { type NextRequest, NextResponse } from 'next/server';

import { classifyRequestHost, platformRootDomain } from './lib/host';
import { decideRoute } from './lib/routing';
import {
  APEX_HEADER,
  CONTEXT_HEADER,
  type ContextLookup,
  encodeContextHeader,
  lookupTenantContext,
} from './lib/tenant-context';

const PROXY_SECRET_HEADER = 'x-ab-proxy-secret';

/**
 * Host routing (C-34: `proxy.ts` is Next.js 16's middleware; ARCHITECTURE §4.2, §10.2).
 * - `/api/*` → the API on the same origin, forwarding the browser's host and the shared proxy
 *   secret so the API can trust X-Forwarded-Host (C-46). Client-supplied values are overwritten.
 * - Pages: classify the host (`@academybee/tenant`), look up the academy for tenant/custom hosts,
 *   then rewrite to the experience (`/t/<slug>`, `/console`, `/hub`, marketing), a status page,
 *   or 301 an old slug to the primary host. Internal `x-ab-*` request headers are always
 *   stripped first and only this file sets them.
 */
export async function proxy(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (name.startsWith('x-ab-')) headers.delete(name);

  if (request.nextUrl.pathname.startsWith('/api/')) {
    const apiOrigin = process.env.API_ORIGIN;
    const secret = process.env.TRUSTED_PROXY_SECRET;
    if (!apiOrigin || !secret) return new NextResponse(null, { status: 503 });
    const target = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, apiOrigin);
    headers.set('x-forwarded-host', host);
    headers.set('x-forwarded-proto', request.nextUrl.protocol.replace(':', ''));
    headers.set(PROXY_SECRET_HEADER, secret);
    return NextResponse.rewrite(target, { request: { headers } });
  }

  const hostClass = classifyRequestHost(host);
  let lookup: ContextLookup | 'unavailable' | undefined;
  if (hostClass.kind === 'tenant' || hostClass.kind === 'custom') {
    lookup = await lookupTenantContext(hostClass.host, {
      apiOrigin: process.env.API_ORIGIN ?? '',
      proxySecret: process.env.TRUSTED_PROXY_SECRET ?? '',
      ...(process.env.TENANT_CONTEXT_CACHE === 'off' ? { cacheMs: { hit: 0, miss: 0 } } : {}),
    }).catch(() => 'unavailable' as const);
  }

  const { pathname, search, port, protocol } = request.nextUrl;
  const decision = decideRoute({ hostClass, pathname, search, port, protocol, lookup });
  if (decision.type === 'redirect') return NextResponse.redirect(decision.location, 301);

  const root = normalizeRootDomain(platformRootDomain());
  headers.set(APEX_HEADER, `${protocol}//${root}${port ? `:${port}` : ''}`);
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
  matcher: ['/((?!_next/static|_next/image|serwist/|icons/|favicon.ico|manifest.webmanifest).*)'],
};
