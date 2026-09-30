import { Container } from '@academybee/ui';
import { getTranslations } from 'next-intl/server';

import { OfflineRetry } from './offline-retry';

export const dynamic = 'force-static';

/** Precached by the service worker; shown for navigations while offline (ADR-015). */
export default async function OfflinePage() {
  const t = await getTranslations('shell.offlinePage');
  return (
    <Container maxWidth="sm">
      <OfflineRetry title={t('title')} body={t('body')} retryLabel={t('retry')} />
    </Container>
  );
}
