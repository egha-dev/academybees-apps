import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { AuthFrame } from '@/components/auth/auth-frame';
import { resetLabels } from '@/components/auth/labels.server';
import { ResetForm, ResetLinkInvalid } from '@/components/auth/reset-form';
import { academyColor, academyName, hostContext } from '@/lib/host-context.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.reset');
  // The token stays out of referrers sent to other sites.
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

/** Choose a new password from an emailed link (single use, 1 hour; C-67). */
export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [{ context }, { token }, t, labels] = await Promise.all([
    hostContext(),
    params,
    getTranslations('auth.reset'),
    resetLabels(),
  ]);
  const academy = academyName(context);
  if (!academy) notFound();
  const wellFormed = /^[A-Za-z0-9_-]{16,128}$/.test(token);
  return (
    <AuthFrame
      academy={academy}
      primaryColor={academyColor(context)}
      title={wellFormed ? t('title') : t('invalidTitle')}
      body={wellFormed ? t('body') : undefined}
    >
      {wellFormed ? (
        <ResetForm token={token} labels={labels} />
      ) : (
        <ResetLinkInvalid labels={labels} />
      )}
    </AuthFrame>
  );
}
