'use client';

import { ToastProvider } from '@academybee/ui/components/feedback';
import { AppRouterCacheProvider } from '@academybee/ui/next';
import { UiProvider } from '@academybee/ui/provider';
import { SerwistProvider } from '@serwist/turbopack/react';
import { lazy, type ReactNode, Suspense } from 'react';

import { type ShellLabels, ShellLabelsProvider } from './shell-labels';

// Install/update prompts appear only after a browser event: load them after the page (G-24).
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
          <SerwistProvider
            swUrl="/serwist/sw.js"
            disable={!serviceWorker}
            options={{ scope: '/' }}
            reloadOnOnline={false}
          >
            <ToastProvider closeLabel={labels.close}>
              {children}
              {serviceWorker && (
                <Suspense fallback={null}>
                  <PwaPrompts />
                </Suspense>
              )}
            </ToastProvider>
          </SerwistProvider>
        </ShellLabelsProvider>
      </UiProvider>
    </AppRouterCacheProvider>
  );
}
