import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { AuthFrame } from '@/components/auth/auth-frame';
import { FragmentTokenGate } from '@/components/auth/fragment-token';
import { resetLabels } from '@/components/auth/labels.server';
import { ResetForm, ResetLinkInvalid } from '@/components/auth/reset-form';
import { academyColor, academyLogo, academyName, hostContext } from '@/lib/host-context.server';

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

/**
 * Choose a new password from an emailed link (single use, 1 hour; C-67). The token is in the
 * fragment (`/reset-password#token=…`), read in the browser, never seen by a server (C-83).
 */
export default async function ResetPasswordPage() {
  const [{ context }, t, labels] = await Promise.all([
    hostContext(),
    getTranslations('auth.reset'),
    resetLabels(),
  ]);
  const academy = academyName(context);
  if (!academy) notFound();
  const frame = { academy, primaryColor: academyColor(context), logoUrl: academyLogo(context) };
  return (
    <FragmentTokenGate
      pending={<AuthFrame {...frame} title={t('title')} />}
      valid={
        <AuthFrame {...frame} title={t('title')} body={t('body')}>
          <ResetForm labels={labels} />
        </AuthFrame>
      }
      invalid={
        <AuthFrame {...frame} title={t('invalidTitle')}>
          <ResetLinkInvalid labels={labels} />
        </AuthFrame>
      }
    />
  );
}
