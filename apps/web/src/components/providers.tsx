'use client';

import { ToastProvider } from '@academybee/ui/components/feedback';
import { AppRouterCacheProvider } from '@academybee/ui/next';
import { UiProvider } from '@academybee/ui/provider';
import { lazy, type ReactNode, Suspense } from 'react';

import { type ShellLabels, ShellLabelsProvider } from './shell-labels';

// Install/update prompts appear only after a browser event, and they register the service worker
// after the page has loaded: none of it is in the route's first-load JS (G-24, C-99).
const PwaPrompts = lazy(() => import('./pwa-prompts').then((m) => ({ default: m.PwaPrompts })));

export function Providers({
  children,
  labels,
  serviceWorker,
}: {
  children: ReactNode;
  labels: ShellLabels;
  serviceWorker: boolean;
}) {
  return (
    <AppRouterCacheProvider options={{ key: 'ab' }}>
      <UiProvider>
        <ShellLabelsProvider labels={labels}>
          <ToastProvider closeLabel={labels.close}>
            {children}
            {serviceWorker && (
              <Suspense fallback={null}>
                <PwaPrompts />
              </Suspense>
            )}
          </ToastProvider>
        </ShellLabelsProvider>
      </UiProvider>
    </AppRouterCacheProvider>
  );
}
