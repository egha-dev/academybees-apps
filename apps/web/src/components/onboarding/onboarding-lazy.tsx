'use client';

// The setup pages ship this wrapper; the forms load as their own chunk, rendered on the server
// first (route budget, G-24).
import { type ComponentProps, lazy, Suspense } from 'react';

const Step = lazy(() => import('./step-form').then((m) => ({ default: m.StepForm })));

export function StepFormLazy(props: ComponentProps<typeof Step>) {
  return (
    <Suspense fallback={null}>
      <Step {...props} />
    </Suspense>
  );
}
