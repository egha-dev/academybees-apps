'use client';

import { getMessages } from '@academybee/i18n';
import { Container, ErrorState, UiProvider } from '@academybee/ui';
import { createTranslator } from 'use-intl/core';

/** Last-resort boundary (replaces the root layout, so providers are rebuilt here). */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = createTranslator({ locale: 'en-IN', messages: getMessages('en-IN') });
  return (
    <html lang="en-IN">
      <body>
        <UiProvider>
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
        </UiProvider>
      </body>
    </html>
  );
}
