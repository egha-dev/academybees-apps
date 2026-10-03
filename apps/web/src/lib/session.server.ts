import 'server-only';

import { type MeResponse, MeResponseSchema } from '@academybee/contracts';
import { headers } from 'next/headers';
import { cache } from 'react';

import { apiServerGet } from './api.server';

/**
 * The signed-in user as the API sees it, read once per request (ARCHITECTURE §6.2, plan 2.15).
 * The browser's cookies are forwarded with its host and the proxy secret, exactly like a `/api`
 * call through `proxy.ts`. The access token lives inside a cookie that outlasts it, so an
 * expired token is reported as `expired` (the page then refreshes on the client: the refresh
 * cookie is scoped to `/api/v1/auth` and never reaches page requests).
 */
export type Session =
  { state: 'signed-in'; me: MeResponse } | { state: 'expired' } | { state: 'signed-out' };

export const getSession = cache(async (): Promise<Session> => {
  const h = await headers();
  const cookie = h.get('cookie');
  if (!cookie) return { state: 'signed-out' };
  const res = await apiServerGet('/auth/me');
  if (res.ok) return { state: 'signed-in', me: MeResponseSchema.parse(await res.json()) };
  if (res.status === 401) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    return body?.error?.code === 'SESSION_EXPIRED' ? { state: 'expired' } : { state: 'signed-out' };
  }
  // 5xx and anything unexpected: the page's error boundary shows a designed error state.
  throw new Error(`session lookup failed (${res.status})`);
});

/** Where a signed-in academy user starts (ARCHITECTURE §10.2). */
export function homeFor(me: MeResponse): string {
  return me.academy?.primaryExperience === 'teach' ? '/teach' : '/today';
}
