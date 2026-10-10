'use client';

// Teacher pages ship only these wrappers; the sheets load on use (G-24, C-99).
import { type ComponentProps, lazy, Suspense } from 'react';

const Add = lazy(() => import('./teacher-sheets').then((m) => ({ default: m.AddTeacherSheet })));
const Actions = lazy(() => import('./teacher-sheets').then((m) => ({ default: m.TeacherActions })));

export function AddTeacherLazy(props: ComponentProps<typeof Add>) {
  return (
    <Suspense fallback={null}>
      <Add {...props} />
    </Suspense>
  );
}

export function TeacherActionsLazy(props: ComponentProps<typeof Actions>) {
  return (
    <Suspense fallback={null}>
      <Actions {...props} />
    </Suspense>
  );
}
