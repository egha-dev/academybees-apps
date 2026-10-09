import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { ExpiredRefresh } from '@/components/auth/expired-refresh';
import { signOutLabels } from '@/components/auth/labels.server';
import { onboardingOwner } from '@/components/onboarding/owner.server';
import { SetupFrame } from '@/components/onboarding/setup-frame';
import { academyColor, academyLogo, academyName, hostContext } from '@/lib/host-context.server';

export const dynamic = 'force-dynamic';

/**
 * Route group: the academy owner's guided setup (UX v1.1 §4–5, C-85) — the legal step, Welcome,
 * the steps and Ready — outside the Manage shell. Owner only, behind `p3-onboarding`.
 */
export default async function SetupLayout({ children }: { children: ReactNode }) {
  const owner = await onboardingOwner();
  if (owner.state === 'expired') return <ExpiredRefresh />;
  const [{ context }, signOut, t] = await Promise.all([
    hostContext(),
    signOutLabels(),
    getTranslations('onboarding.frame'),
  ]);
  return (
    <SetupFrame
      academy={academyName(context) ?? ''}
      primaryColor={academyColor(context)}
      logoUrl={academyLogo(context)}
      signOut={{ ...signOut, signOut: t('signOut') }}
      saved={t('saved')}
    >
      {children}
    </SetupFrame>
  );
}
