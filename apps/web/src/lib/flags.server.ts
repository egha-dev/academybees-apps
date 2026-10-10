import 'server-only';

import type { FeatureFlagKey } from '@academybee/contracts';
import { headers } from 'next/headers';
import { cache } from 'react';

import { serverEnv } from './env';
import { type FlagsResponse, isFlagOn } from './flags';

/**
 * Evaluate a release flag on the server via the API (ADR-041). Network or API errors → off,
 * so unfinished work stays hidden rather than leaking.
 */
export async function flagEnabled(key: FeatureFlagKey, host: string): Promise<boolean> {
  const env = serverEnv();
  try {
    const res = await fetch(new URL('/api/v1/flags', env.API_ORIGIN), {
      headers: { 'x-forwarded-host': host, 'x-ab-proxy-secret': env.TRUSTED_PROXY_SECRET },
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return false;
    return isFlagOn((await res.json()) as FlagsResponse, key);
  } catch {
    return false;
  }
}

/** `p2-role-homes` for the current request's academy (C-68): the signed-in landings. */
export const roleHomesEnabled = cache(async (): Promise<boolean> =>
  flagEnabled('p2-role-homes', (await headers()).get('host') ?? ''),
);

/** Phase 4 people workspaces (Students, Student 360, Teachers…) while they are built (ADR-041). */
export const peopleEnabled = cache(async (): Promise<boolean> =>
  flagEnabled('p4-people', (await headers()).get('host') ?? ''),
);

/** Phase 4 S6: parent invites, Parent app, privacy notice, Join requests (ADR-041). */
export const familyLinkEnabled = cache(async (): Promise<boolean> =>
  flagEnabled('p4-family-link', (await headers()).get('host') ?? ''),
);
