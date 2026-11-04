'use client';

// Finance pages sit on the academy shell at the route budget (G-24): they ship only this wrapper,
// and each form or sheet loads as its own chunk.
import { type ComponentProps, lazy, Suspense } from 'react';

const SettingsForm = lazy(() =>
  import('./finance-settings-form').then((m) => ({ default: m.FinanceSettingsForm })),
);
const PlanActions = lazy(() => import('./fee-plan-sheet').then((m) => ({ default: m.PlanSheet })));
const PlanStatus = lazy(() =>
  import('./fee-plan-sheet').then((m) => ({ default: m.PlanStatusButton })),
);
const AssignActions = lazy(() =>
  import('./assign-sheet').then((m) => ({ default: m.AssignSheet })),
);
const EndAssignment = lazy(() =>
  import('./assign-sheet').then((m) => ({ default: m.EndAssignment })),
);
const OneTime = lazy(() => import('./one-time-sheet').then((m) => ({ default: m.OneTimeSheet })));

export function FinanceSettingsLazy(props: ComponentProps<typeof SettingsForm>) {
  return (
    <Suspense fallback={null}>
      <SettingsForm {...props} />
    </Suspense>
  );
}
export function PlanSheetLazy(props: ComponentProps<typeof PlanActions>) {
  return (
    <Suspense fallback={null}>
      <PlanActions {...props} />
    </Suspense>
  );
}
export function PlanStatusLazy(props: ComponentProps<typeof PlanStatus>) {
  return (
    <Suspense fallback={null}>
      <PlanStatus {...props} />
    </Suspense>
  );
}
export function AssignSheetLazy(props: ComponentProps<typeof AssignActions>) {
  return (
    <Suspense fallback={null}>
      <AssignActions {...props} />
    </Suspense>
  );
}
export function EndAssignmentLazy(props: ComponentProps<typeof EndAssignment>) {
  return (
    <Suspense fallback={null}>
      <EndAssignment {...props} />
    </Suspense>
  );
}
export function OneTimeSheetLazy(props: ComponentProps<typeof OneTime>) {
  return (
    <Suspense fallback={null}>
      <OneTime {...props} />
    </Suspense>
  );
}
