'use client';

import { type ComponentProps, lazy, Suspense } from 'react';

// Only people who manage settings see the rule editor; load it (and its checkboxes) for them only.
const Rule = lazy(() => import('./mfa-rule').then((m) => ({ default: m.MfaRule })));

export function MfaRuleLazy(props: ComponentProps<typeof Rule>) {
  return (
    <Suspense fallback={null}>
      <Rule {...props} />
    </Suspense>
  );
}
