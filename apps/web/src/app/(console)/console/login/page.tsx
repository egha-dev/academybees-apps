import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { TwoStepSignIn } from '@/components/auth/two-step-sign-in';
import { consoleSignInLabels } from '@/components/console/labels.server';
import { PlatformFrame } from '@/components/platform/platform-frame';
import { getSession } from '@/lib/session.server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.console.login');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/** Console sign-in: password + TOTP for AcademyBee staff (C-02, C-66). */
export default async function ConsoleLoginPage() {
  const [session, t, labels] = await Promise.all([
    getSession(),
    getTranslations('auth.console.login'),
    consoleSignInLabels(),
  ]);
  if (session.state === 'signed-in') redirect('/');
  return (
    <PlatformFrame title={t('title')} body={t('body')}>
      <TwoStepSignIn labels={labels} showForgot={false} />
    </PlatformFrame>
  );
}
