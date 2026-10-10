'use client';

// The Join requests page ships only this wrapper; the approve/reject sheets load on use (G-24).
import { type ComponentProps, lazy, Suspense } from 'react';

const Actions = lazy(() =>
  import('./join-request-actions').then((m) => ({ default: m.JoinRequestActions })),
);

export function JoinRequestActionsLazy(props: ComponentProps<typeof Actions>) {
  return (
    <Suspense fallback={null}>
      <Actions {...props} />
    </Suspense>
  );
}
