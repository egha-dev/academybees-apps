import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { FragmentTokenGate } from '@/components/auth/fragment-token';
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

/**
 * Set-password link from `pnpm platform:create-admin` (24 h, single use; C-66). The token is in
 * the fragment (`/set-password#token=…`), never sent to a server (C-83).
 */
export default async function SetPasswordPage() {
  const [t, reset, labels] = await Promise.all([
    getTranslations('auth.console.setPassword'),
    getTranslations('auth.reset'),
    resetLabels(),
  ]);
  const consoleLabels = { ...labels, invalidBody: t('invalidBody') };
  return (
    <FragmentTokenGate
      pending={<PlatformFrame title={t('title')} />}
      valid={
        <PlatformFrame title={t('title')} body={t('body')}>
          <ResetForm labels={consoleLabels} canRequestNew={false} />
        </PlatformFrame>
      }
      invalid={
        <PlatformFrame title={reset('invalidTitle')}>
          <ResetLinkInvalid labels={consoleLabels} canRequestNew={false} />
        </PlatformFrame>
      }
    />
  );
}
