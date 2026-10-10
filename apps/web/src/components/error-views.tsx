// Loaded only when an error boundary renders (C-99): the error UI, its buttons and the global
// boundary's catalogue strings stay out of every route's first-load JS. No 'use client' here —
// the boundaries that lazy-load it are client components already (C-80).
import common from '@academybee/i18n/messages/en-IN/common.json';
import shell from '@academybee/i18n/messages/en-IN/shell.json';
import { ErrorState } from '@academybee/ui/components/feedback';
import { Container } from '@academybee/ui/components/layout';
import { UiProvider } from '@academybee/ui/provider';

import { fill, useShellLabels } from './shell-labels';

type BoundaryProps = { digest?: string | undefined; reset: () => void };

/** Route error boundary: what happened + next step, with a reference for support. */
export function RouteErrorView({ digest, reset }: BoundaryProps) {
  const labels = useShellLabels();
  return (
    <Container maxWidth="sm">
      <ErrorState
        title={labels.errorTitle}
        body={labels.errorBody}
        retry={{ label: labels.retry, onClick: reset }}
        secondary={{ label: labels.goHome, href: '/' }}
        {...(digest ? { reference: fill(labels.errorReference, { requestId: digest }) } : {})}
      />
    </Container>
  );
}

/**
 * Last-resort boundary content: it replaces the root layout, so no providers or server
 * translations are available. It reads the en-IN catalogue JSON directly (static strings, no ICU
 * runtime).
 */
export function GlobalErrorView({ digest, reset }: BoundaryProps) {
  return (
    <UiProvider>
      <Container maxWidth="sm">
        <ErrorState
          title={shell.error.title}
          body={shell.error.body}
          retry={{ label: common.actions.retry, onClick: reset }}
          secondary={{ label: common.actions.goHome, href: '/' }}
          {...(digest ? { reference: fill(shell.error.reference, { requestId: digest }) } : {})}
        />
      </Container>
    </UiProvider>
  );
}
