'use client';

import { lazy, Suspense } from 'react';

// The error UI loads only when an error happens (route JS budget, G-24, C-99).
const RouteErrorView = lazy(() =>
  import('@/components/error-views').then((m) => ({ default: m.RouteErrorView })),
);

/** Route error boundary: what happened + next step, with a reference for support. */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Suspense fallback={null}>
      <RouteErrorView digest={error.digest} reset={reset} />
    </Suspense>
  );
}
