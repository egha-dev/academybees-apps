'use client';

import { lazy, Suspense } from 'react';

// Loaded only when the root layout itself fails (route JS budget, G-24, C-99).
const GlobalErrorView = lazy(() =>
  import('@/components/error-views').then((m) => ({ default: m.GlobalErrorView })),
);

/** Last-resort boundary: it replaces the root layout, so it brings its own document. */
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
        <Suspense fallback={null}>
          <GlobalErrorView digest={error.digest} reset={reset} />
        </Suspense>
      </body>
    </html>
  );
}
