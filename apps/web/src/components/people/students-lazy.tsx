'use client';

// The people pages sit on the academy shell under the 200 KB route budget (G-24, C-99): pages
// ship only these wrappers; each workspace part loads as its own chunk (rendered on the server
// first, so the page is readable before the chunk arrives).
import { type ComponentProps, lazy, Suspense } from 'react';

const Browser = lazy(() =>
  import('./students-browser').then((m) => ({ default: m.StudentsBrowser })),
);
const AddStudent = lazy(() =>
  import('./add-student-sheet').then((m) => ({ default: m.AddStudentSheet })),
);
const Actions = lazy(() =>
  import('./student-actions').then((m) => ({ default: m.StudentActions })),
);
const ParentActions = lazy(() =>
  import('./parent-actions').then((m) => ({ default: m.ParentActions })),
);
const Health = lazy(() => import('./health-note').then((m) => ({ default: m.HealthNote })));
const Consent = lazy(() => import('./consent-record').then((m) => ({ default: m.ConsentRecord })));
const FieldsEditor = lazy(() =>
  import('./custom-fields-editor').then((m) => ({ default: m.CustomFieldsEditor })),
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

export const StudentsBrowserLazy = lazyPart<ComponentProps<typeof Browser>>(Browser);
export const AddStudentLazy = lazyPart<ComponentProps<typeof AddStudent>>(AddStudent);
export const StudentActionsLazy = lazyPart<ComponentProps<typeof Actions>>(Actions);
export const ParentActionsLazy = lazyPart<ComponentProps<typeof ParentActions>>(ParentActions);
export const HealthNoteLazy = lazyPart<ComponentProps<typeof Health>>(Health);
export const ConsentRecordLazy = lazyPart<ComponentProps<typeof Consent>>(Consent);
export const CustomFieldsEditorLazy = lazyPart<ComponentProps<typeof FieldsEditor>>(FieldsEditor);
