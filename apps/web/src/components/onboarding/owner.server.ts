import 'server-only';

import {
  type MeResponse,
  type OnboardingState,
  OnboardingStateSchema,
} from '@academybee/contracts';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { apiServerGet } from '@/lib/api.server';
import { getSession } from '@/lib/session.server';

export type OnboardingOwner = { state: 'expired' } | { state: 'signed-in'; me: MeResponse };

/**
 * The guided setup is for the academy's owner only (`academy.onboarding.manage`, C-85). Signed out → sign in; anyone else → the academy's home (the setup
 * gate or Today decides what they see).
 */
export const onboardingOwner = cache(async (): Promise<OnboardingOwner> => {
  const session = await getSession();
  if (session.state === 'signed-out') redirect('/login');
  if (session.state === 'expired') return { state: 'expired' };
  if (!session.me.academy?.capabilities['academy.onboarding.manage']) redirect('/');
  return { state: 'signed-in', me: session.me };
});

/** The setup state; legal documents not accepted yet → the legal step first (ADR-034). */
export const loadOnboarding = cache(async (): Promise<OnboardingState> => {
  const res = await apiServerGet('/onboarding');
  if (res.status === 403) {
    const body = (await res.json().catch(() => null)) as {
      error?: { details?: { issue: string }[] };
    } | null;
    if (body?.error?.details?.some((d) => d.issue === 'acceptance_required')) redirect('/legal');
  }
  if (!res.ok) throw new Error(`onboarding ${res.status}`);
  return OnboardingStateSchema.parse(await res.json());
});
