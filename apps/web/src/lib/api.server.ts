import 'server-only';

import { headers } from 'next/headers';

import { serverEnv } from './env';
import { apiForwardHeaders } from './forward-headers';

/**
 * A server-side GET to the API on behalf of the current browser request: the same host, proxy
 * secret and client IP rules as the `/api/*` rewrite in proxy.ts (C-46, review M1), plus the
 * browser's cookies. Only the headers the API needs are forwarded.
 */
export async function apiServerGet(path: string): Promise<Response> {
  const h = await headers();
  const env = serverEnv();
  const clientIpHeader = process.env.TRUSTED_CLIENT_IP_HEADER || undefined;
  const minimal = new Headers({ accept: 'application/json' });
  for (const name of ['cookie', 'user-agent', ...(clientIpHeader ? [clientIpHeader] : [])]) {
    const value = h.get(name);
    if (value) minimal.set(name, value);
  }
  return fetch(new URL(`/api/v1${path}`, env.API_ORIGIN), {
    headers: apiForwardHeaders(minimal, {
      host: h.get('host') ?? '',
      proto: h.get('x-forwarded-proto') ?? 'http',
      secret: env.TRUSTED_PROXY_SECRET,
      clientIpHeader,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  });
}
