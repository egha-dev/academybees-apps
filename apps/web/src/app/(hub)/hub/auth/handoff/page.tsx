import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { HandoffExchange } from '@/components/hub/handoff-exchange';
import { PlatformFrame } from '@/components/platform/platform-frame';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.hub.handoff');
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

/** Landing for parents and students signed in on an academy URL (C-61). */
export default async function HandoffPage() {
  const t = await getTranslations('auth.hub');
  return (
    <PlatformFrame title={t('login.title')}>
      <HandoffExchange
        labels={{
          working: t('handoff.working'),
          failedTitle: t('handoff.failedTitle'),
          failedBody: t('handoff.failedBody'),
          signIn: t('handoff.signIn'),
        }}
      />
    </PlatformFrame>
  );
}
