import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { ExpiredRefresh } from '@/components/auth/expired-refresh';
import { signOutLabels } from '@/components/auth/labels.server';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { PlatformFrame } from '@/components/platform/platform-frame';
import { flagEnabled } from '@/lib/flags.server';
import { getSession } from '@/lib/session.server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.console.home');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/** Console home: signed-in placeholder behind `p2-console-home` until Phase 3's academies list. */
export default async function ConsoleHome() {
  const h = await headers();
  if (!(await flagEnabled('p2-console-home', h.get('host') ?? ''))) notFound();
  const [session, t, signOut] = await Promise.all([
    getSession(),
    getTranslations('auth.console.home'),
    signOutLabels(),
  ]);
  if (session.state === 'signed-out') redirect('/login');
  if (session.state === 'expired') return <ExpiredRefresh />;
  const role = session.me.platform?.role;
  if (!role) redirect('/login');
  return (
    <PlatformFrame
      title={t('title')}
      body={t('body', { name: session.me.user.name, role: t(`roles.${role}`) })}
    >
      <SignOutButton labels={signOut} />
    </PlatformFrame>
  );
}
