'use client';

import common from '@academybee/i18n/messages/en-IN/common.json';
import shell from '@academybee/i18n/messages/en-IN/shell.json';
import { ErrorState } from '@academybee/ui/components/feedback';
import { Container } from '@academybee/ui/components/layout';
import { UiProvider } from '@academybee/ui/provider';

import { fill } from '@/components/shell-labels';

/**
 * Last-resort boundary: it replaces the root layout, so no providers or server translations are
 * available. It reads the en-IN catalogue JSON directly (static strings, no ICU runtime).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en-IN">
      <body>
        <UiProvider>
          <Container maxWidth="sm">
            <ErrorState
              title={shell.error.title}
              body={shell.error.body}
              retry={{ label: common.actions.retry, onClick: reset }}
              secondary={{ label: common.actions.goHome, href: '/' }}
              {...(error.digest
                ? { reference: fill(shell.error.reference, { requestId: error.digest }) }
                : {})}
            />
          </Container>
        </UiProvider>
      </body>
    </html>
  );
}
