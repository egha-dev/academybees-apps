'use client';

import { ToastProvider } from '@academybee/ui/components/feedback';
import { AppRouterCacheProvider } from '@academybee/ui/next';
import { UiProvider } from '@academybee/ui/provider';
import { SerwistProvider } from '@serwist/turbopack/react';
import { type ReactNode } from 'react';

import { PwaPrompts } from './pwa-prompts';
import { type ShellLabels, ShellLabelsProvider } from './shell-labels';

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
              {serviceWorker && <PwaPrompts />}
            </ToastProvider>
          </SerwistProvider>
        </ShellLabelsProvider>
      </UiProvider>
    </AppRouterCacheProvider>
  );
}
