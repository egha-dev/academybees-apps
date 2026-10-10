'use client';

// The import page ships only this wrapper; the wizard loads as its own chunk (G-24, C-99).
import { type ComponentProps, lazy, Suspense } from 'react';

const Wizard = lazy(() => import('./import-wizard').then((m) => ({ default: m.ImportWizard })));

export function ImportWizardLazy(props: ComponentProps<typeof Wizard>) {
  return (
    <Suspense fallback={null}>
      <Wizard {...props} />
    </Suspense>
  );
}
