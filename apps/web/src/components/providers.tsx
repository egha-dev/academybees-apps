'use client';

import { ToastProvider, UiProvider } from '@academybee/ui';
import { AppRouterCacheProvider } from '@academybee/ui/next';
import { SerwistProvider } from '@serwist/turbopack/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  type AbstractIntlMessages,
  type Locale,
  NextIntlClientProvider,
  useTranslations,
} from 'next-intl';
import { type ReactNode, useState } from 'react';

import { PwaPrompts } from './pwa-prompts';

function WithToasts({ children }: { children: ReactNode }) {
  const t = useTranslations('common.actions');
  return <ToastProvider closeLabel={t('close')}>{children}</ToastProvider>;
}

export function Providers({
  children,
  locale,
  timeZone,
  messages,
  serviceWorker,
}: {
  children: ReactNode;
  locale: Locale;
  timeZone: string;
  messages: AbstractIntlMessages;
  serviceWorker: boolean;
}) {
  // One QueryClient per browser session (TanStack Query, ARCHITECTURE §10.7).
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );
  return (
    <AppRouterCacheProvider options={{ key: 'ab' }}>
      <UiProvider>
        <NextIntlClientProvider locale={locale} timeZone={timeZone} messages={messages}>
          <QueryClientProvider client={queryClient}>
            <SerwistProvider
              swUrl="/serwist/sw.js"
              disable={!serviceWorker}
              options={{ scope: '/' }}
              reloadOnOnline={false}
            >
              <WithToasts>
                {children}
                {serviceWorker && <PwaPrompts />}
              </WithToasts>
            </SerwistProvider>
          </QueryClientProvider>
        </NextIntlClientProvider>
      </UiProvider>
    </AppRouterCacheProvider>
  );
}
