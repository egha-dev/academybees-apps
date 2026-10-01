import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';

import { serverEnv } from '@/lib/env';

import { DesignSystemShowcase } from './showcase';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/**
 * Every component and state (task 0.7). Gated by environment: 404 in production.
 * The showcase formats ICU messages on the client, so only this route ships the next-intl runtime.
 */
export default async function DesignSystemPage() {
  if (serverEnv().APP_ENV === 'production') notFound();
  return (
    <NextIntlClientProvider messages={await getMessages()}>
      <DesignSystemShowcase />
    </NextIntlClientProvider>
  );
}
