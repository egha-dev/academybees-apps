import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { loginLabels } from '@/components/auth/labels.server';
import { LoginForm } from '@/components/auth/login-form';
import { PlatformFrame } from '@/components/platform/platform-frame';
import { getSession } from '@/lib/session.server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.hub.login');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/** Family Hub sign-in for parents and students (G-31, ADR-039). */
export default async function HubLoginPage() {
  const [session, t, labels] = await Promise.all([
    getSession(),
    getTranslations('auth.hub.login'),
    loginLabels(),
  ]);
  if (session.state === 'signed-in') redirect('/');
  return (
    <PlatformFrame title={t('title')} body={t('body')}>
      {/* Password reset on the hub arrives with Parent Core (7P); academies reset staff only. */}
      <LoginForm labels={labels} showForgot={false} />
    </PlatformFrame>
  );
}
