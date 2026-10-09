import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { StatusPage } from '@/components/status-page';
import { academyColor, academyName, hostContext } from '@/lib/host-context.server';
import { getSession } from '@/lib/session.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('tenant.status.setup');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/**
 * An academy that is setting up (C-85), reached only through proxy.ts with `p3-onboarding` on:
 * its owner continues the guided setup (Welcome sends them to the legal step first if needed);
 * everyone else — signed out, or staff without `academy.onboarding.manage` — sees that the
 * academy is getting ready.
 */
export default async function SetupGate() {
  const [session, { context, apexUrl }, t] = await Promise.all([
    getSession(),
    hostContext(),
    getTranslations('tenant.status'),
  ]);
  if (
    session.state === 'signed-in' &&
    session.me.academy?.capabilities['academy.onboarding.manage']
  )
    redirect('/welcome');
  const name = academyName(context);
  const academy = name ?? t('fallbackAcademy');
  return (
    <StatusPage
      academyName={name}
      academyColor={academyColor(context)}
      tone="info"
      title={t('setup.title', { academy })}
      body={t('setup.body', { academy })}
      action={
        session.state === 'signed-out'
          ? { label: t('setup.signIn'), href: '/login' }
          : { label: t('setup.action'), href: apexUrl }
      }
    />
  );
}
