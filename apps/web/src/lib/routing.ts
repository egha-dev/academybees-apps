import type { HostClass } from '@academybee/tenant';

import type { ContextLookup } from './tenant-context';

/**
 * Host → experience routing table (ARCHITECTURE §10.2, UX v1.1 §7). Pure, so every case is
 * unit-tested; `proxy.ts` performs the decision.
 */
export type StatusState = 'unknown' | 'suspended' | 'archived' | 'setup' | 'unavailable';

export type RouteDecision =
  | { type: 'next' }
  | { type: 'rewrite'; path: string; status?: number }
  | { type: 'redirect'; location: string; status: 301 };

/** App-level pages served the same way on every host (offline fallback, dev tools). */
const SHARED_PREFIXES = ['/offline', '/dev'];
const MANIFEST = '/manifest.webmanifest';

/**
 * What an academy that is setting up serves (C-85): sign-in, the legal step and the guided setup.
 * Every other path goes to the setup gate, which sends the owner on and shows everyone else the
 * "getting ready" page.
 */
const SETUP_OPEN_PREFIXES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/invite',
  '/legal',
  '/welcome',
  '/onboarding',
  '/academy-icon',
];
export const SETUP_GATE = '/setup-gate';

/** Route-group folders only reachable through a rewrite, never by typing the URL. */
const INTERNAL_PREFIXES = ['/t', '/console', '/hub', '/status'];

const STATUS_HTTP: Record<StatusState, number> = {
  unknown: 404,
  suspended: 503,
  archived: 410,
  setup: 200,
  unavailable: 503,
};

/** `path` is the segment `p` or below it — `/hub` and `/hub/x`, never `/hubs` (review L3). */
const starts = (path: string, prefixes: readonly string[]) =>
  prefixes.some((p) => path === p || path.startsWith(`${p}/`));

export function statusRewrite(state: StatusState): RouteDecision {
  return { type: 'rewrite', path: `/status/${state}`, status: STATUS_HTTP[state] };
}

export function decideRoute(input: {
  hostClass: HostClass;
  pathname: string;
  search: string;
  /** `host:port` the browser used, for redirects that keep the port (local dev). */
  port: string;
  protocol: string;
  /** Academy lookup for tenant/custom hosts; `'unavailable'` when the API can't be reached. */
  lookup?: ContextLookup | 'unavailable' | undefined;
}): RouteDecision {
  const { hostClass, pathname } = input;
  if (starts(pathname, INTERNAL_PREFIXES) || starts(pathname, [SETUP_GATE]))
    return { type: 'rewrite', path: '/__not-found' };
  if (starts(pathname, SHARED_PREFIXES)) return { type: 'next' };
  // Only ACTIVE academies serve their own manifest; every other host gets AcademyBee's.
  const activeAcademy =
    (hostClass.kind === 'tenant' || hostClass.kind === 'custom') &&
    typeof input.lookup === 'object' &&
    input.lookup.found &&
    input.lookup.context.status === 'ACTIVE';
  if (pathname === MANIFEST && !activeAcademy) return { type: 'next' };

  switch (hostClass.kind) {
    case 'marketing':
      return { type: 'next' };
    case 'console':
      return { type: 'rewrite', path: `/console${pathname === '/' ? '' : pathname}` };
    case 'hub':
      return { type: 'rewrite', path: `/hub${pathname === '/' ? '' : pathname}` };
    case 'invalid':
      return statusRewrite('unknown');
    case 'tenant':
    case 'custom': {
      const { lookup } = input;
      if (lookup === 'unavailable' || lookup === undefined) return statusRewrite('unavailable');
      if (!lookup.found) return statusRewrite('unknown');
      const ctx = lookup.context;
      switch (ctx.status) {
        case 'REDIRECT': {
          const port = input.port ? `:${input.port}` : '';
          return {
            type: 'redirect',
            status: 301,
            location: `${input.protocol}//${ctx.host}${port}${pathname}${input.search}`,
          };
        }
        case 'ARCHIVED':
          return statusRewrite('archived');
        case 'SUSPENDED':
          return statusRewrite('suspended');
        case 'SETUP':
          return {
            type: 'rewrite',
            path: `/t/${ctx.slug}${starts(pathname, SETUP_OPEN_PREFIXES) ? pathname : SETUP_GATE}`,
          };
        case 'ACTIVE':
          return { type: 'rewrite', path: `/t/${ctx.slug}${pathname === '/' ? '' : pathname}` };
      }
    }
  }
}
