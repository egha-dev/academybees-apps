'use client';

// Settings pages sit at the route budget (G-24): the editor loads as its own chunk.
import { type ComponentProps, lazy, Suspense } from 'react';

const Editor = lazy(() => import('./courses-editor').then((m) => ({ default: m.CoursesEditor })));

export function CoursesEditorLazy(props: ComponentProps<typeof Editor>) {
  return (
    <Suspense fallback={null}>
      <Editor {...props} />
    </Suspense>
  );
}
