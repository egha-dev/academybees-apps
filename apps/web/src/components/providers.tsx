'use client';

import { ToastProvider } from '@academybee/ui/components/feedback';
import { AppRouterCacheProvider } from '@academybee/ui/next';
import { UiProvider } from '@academybee/ui/provider';
import { SerwistProvider } from '@serwist/turbopack/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

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
  // One QueryClient per browser session (TanStack Query, ARCHITECTURE §10.7).
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );
  return (
    <AppRouterCacheProvider options={{ key: 'ab' }}>
      <UiProvider>
        <ShellLabelsProvider labels={labels}>
          <QueryClientProvider client={queryClient}>
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
          </QueryClientProvider>
        </ShellLabelsProvider>
      </UiProvider>
    </AppRouterCacheProvider>
  );
}
