'use client';

// Batch pages sit on the academy shell under the 200 KB route budget (G-24, C-99): pages ship only
// these wrappers; each sheet loads as its own chunk (rendered on the server first).
import { type ComponentProps, lazy, Suspense } from 'react';

const AddBatch = lazy(() => import('./batch-sheets').then((m) => ({ default: m.AddBatchSheet })));
const Actions = lazy(() => import('./batch-sheets').then((m) => ({ default: m.BatchActions })));
const Pattern = lazy(() => import('./pattern-editor').then((m) => ({ default: m.PatternEditor })));
const Enrol = lazy(() => import('./roster-actions').then((m) => ({ default: m.EnrolStudent })));
const Enrolment = lazy(() =>
  import('./roster-actions').then((m) => ({ default: m.EnrolmentActions })),
);

function lazyPart<P extends object>(Part: React.ComponentType<P>) {
  return function LazyPart(props: P) {
    return (
      <Suspense fallback={null}>
        <Part {...props} />
      </Suspense>
    );
  };
}

export const AddBatchLazy = lazyPart<ComponentProps<typeof AddBatch>>(AddBatch);
export const BatchActionsLazy = lazyPart<ComponentProps<typeof Actions>>(Actions);
export const PatternEditorLazy = lazyPart<ComponentProps<typeof Pattern>>(Pattern);
export const EnrolStudentLazy = lazyPart<ComponentProps<typeof Enrol>>(Enrol);
export const EnrolmentActionsLazy = lazyPart<ComponentProps<typeof Enrolment>>(Enrolment);
