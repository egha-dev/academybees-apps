import { Skeleton } from '@academybee/ui/components/display';
import { Stack } from '@academybee/ui/components/layout';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { flagEnabled } from '@/lib/flags.server';
import { academyColor, academyName, hostContext } from '@/lib/host-context.server';
import { getSession, homeFor } from '@/lib/session.server';

import { AuthFrame } from './auth-frame';
import { sessionGuardLabels, signOutLabels } from './labels.server';
import { SessionGuard } from './session-guard';
import { SignOutButton } from './sign-out-button';

/**
 * Where sign-in lands until the real homes ship (Manage `/today` in Phase 5, Teacher `/teach`
 * in Phase 6), behind release flag `p2-role-homes`. S7 replaces the body with the signed-in
 * shell. Signed-out visitors go to sign-in and come back here afterwards.
 */
export async function SignedInHome({
  path,
  experience,
}: {
  path: string;
  experience: 'manage' | 'teach';
}) {
  const [{ context }, session, h, t] = await Promise.all([
    hostContext(),
    getSession(),
    headers(),
    getTranslations('auth'),
  ]);
  const academy = academyName(context);
  if (!academy || !(await flagEnabled('p2-role-homes', h.get('host') ?? ''))) notFound();
  const frame = { academy, primaryColor: academyColor(context) };

  if (session.state === 'signed-out') redirect(`/login?next=${encodeURIComponent(path)}`);
  if (session.state === 'expired') {
    const labels = await sessionGuardLabels();
    return (
      <AuthFrame {...frame} title={labels.restoring}>
        <Stack spacing={3}>
          <Skeleton label={labels.restoring} />
        </Stack>
        <SessionGuard labels={labels} identifier="" expired />
      </AuthFrame>
    );
  }
  const { me } = session;
  if (!me.academy?.experiences.includes(experience)) redirect(homeFor(me));

  const [guard, signOut] = await Promise.all([sessionGuardLabels(), signOutLabels()]);
  return (
    <AuthFrame
      {...frame}
      title={t('home.title', { academy })}
      body={t('home.body', { name: me.user.name })}
    >
      <Stack direction="row">
        <SignOutButton labels={signOut} />
      </Stack>
      <SessionGuard labels={guard} identifier={me.user.email ?? me.user.phone ?? ''} />
    </AuthFrame>
  );
}
