'use client';

import { Container, ErrorState } from '@academybee/ui';
import { useTranslations } from 'next-intl';

/** Route error boundary: what happened + next step, with a reference for support. */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations();
  return (
    <Container maxWidth="sm">
      <ErrorState
        title={t('shell.error.title')}
        body={t('shell.error.body')}
        retry={{ label: t('common.actions.retry'), onClick: reset }}
        secondary={{ label: t('common.actions.goHome'), href: '/' }}
        {...(error.digest
          ? { reference: t('shell.error.reference', { requestId: error.digest }) }
          : {})}
      />
    </Container>
  );
}
