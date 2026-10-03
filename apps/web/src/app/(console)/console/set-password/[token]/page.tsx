import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { resetLabels } from '@/components/auth/labels.server';
import { ResetForm, ResetLinkInvalid } from '@/components/auth/reset-form';
import { PlatformFrame } from '@/components/platform/platform-frame';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.console.setPassword');
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

/** Set-password link from `pnpm platform:create-admin` (24 h, single use; C-66). */
export default async function SetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const [{ token }, t, reset, labels] = await Promise.all([
    params,
    getTranslations('auth.console.setPassword'),
    getTranslations('auth.reset'),
    resetLabels(),
  ]);
  const consoleLabels = { ...labels, invalidBody: t('invalidBody') };
  const wellFormed = /^[A-Za-z0-9_-]{16,128}$/.test(token);
  return (
    <PlatformFrame
      title={wellFormed ? t('title') : reset('invalidTitle')}
      body={wellFormed ? t('body') : undefined}
    >
      {wellFormed ? (
        <ResetForm token={token} labels={consoleLabels} canRequestNew={false} />
      ) : (
        <ResetLinkInvalid labels={consoleLabels} canRequestNew={false} />
      )}
    </PlatformFrame>
  );
}
