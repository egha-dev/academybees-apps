'use client';

// The Teacher PWA's screens ship as one lazy chunk (Dexie, the sync engine, the views), so each
// /teach page stays inside the 200 KB route budget (G-24, C-99). Nothing renders on the server:
// the data lives on the device (C-124).
import { type ComponentProps, lazy, Suspense } from 'react';

import { useHydrated } from '@/lib/use-hydrated';

const App = lazy(() => import('./teach-app').then((m) => ({ default: m.TeachApp })));

export function TeachAppLazy(props: ComponentProps<typeof App>) {
  if (!useHydrated()) return null;
  return (
    <Suspense fallback={null}>
      <App {...props} />
    </Suspense>
  );
}
