import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { AuthFrame } from '@/components/auth/auth-frame';
import { ForgotForm } from '@/components/auth/forgot-form';
import { forgotLabels } from '@/components/auth/labels.server';
import { academyColor, academyName, hostContext } from '@/lib/host-context.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.forgot');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

export default async function ForgotPasswordPage() {
  const [{ context }, t] = await Promise.all([hostContext(), getTranslations('auth.forgot')]);
  const academy = academyName(context);
  if (!academy) notFound();
  return (
    <AuthFrame
      academy={academy}
      primaryColor={academyColor(context)}
      title={t('title')}
      body={t('body', { academy })}
    >
      <ForgotForm labels={await forgotLabels(academy)} />
    </AuthFrame>
  );
}
