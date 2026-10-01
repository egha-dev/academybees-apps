'use client';

import { ErrorState } from '@academybee/ui/components/feedback';
import { Container } from '@academybee/ui/components/layout';

import { fill, useShellLabels } from '@/components/shell-labels';

/** Route error boundary: what happened + next step, with a reference for support. */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const labels = useShellLabels();
  return (
    <Container maxWidth="sm">
      <ErrorState
        title={labels.errorTitle}
        body={labels.errorBody}
        retry={{ label: labels.retry, onClick: reset }}
        secondary={{ label: labels.goHome, href: '/' }}
        {...(error.digest
          ? { reference: fill(labels.errorReference, { requestId: error.digest }) }
          : {})}
      />
    </Container>
  );
}
