import '@fontsource-variable/inter';
import './globals.css';

import { color } from '@academybee/ui/tokens';
import type { Metadata, Viewport } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { Providers } from '@/components/providers';
import { type ShellLabels } from '@/components/shell-labels';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common');
  return {
    applicationName: t('appName'),
    title: { default: t('appName'), template: `%s · ${t('appName')}` },
    description: t('tagline'),
    manifest: '/manifest.webmanifest',
    appleWebApp: { capable: true, title: t('appName'), statusBarStyle: 'default' },
    icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-180.png' },
  };
}

export const viewport: Viewport = {
  themeColor: color.ivory,
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations()]);
  // Translated on the server so the shell ships no ICU runtime (G-24); see shell-labels.tsx.
  const labels: ShellLabels = {
    close: t('common.actions.close'),
    retry: t('common.actions.retry'),
    goHome: t('common.actions.goHome'),
    install: t('shell.pwa.install'),
    installBody: t('shell.pwa.installBody'),
    updateAvailable: t('shell.pwa.updateAvailable'),
    update: t('shell.pwa.update'),
    later: t('shell.pwa.later'),
    errorTitle: t('shell.error.title'),
    errorBody: t('shell.error.body'),
    errorReference: t.raw('shell.error.reference') as string,
  };
  // The service worker is off in `next dev` (stale caches confuse development) and on in builds.
  const serviceWorker = process.env.NODE_ENV === 'production';
  return (
    <html lang={locale}>
      <body>
        <Providers labels={labels} serviceWorker={serviceWorker}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
