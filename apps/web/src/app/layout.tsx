import '@fontsource-variable/inter';
import './globals.css';

import { ThemeScript } from '@academybee/ui/theme-script';
import { palettes } from '@academybee/ui/tokens';
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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: palettes.light.background },
    { media: '(prefers-color-scheme: dark)', color: palettes.dark.background },
  ],
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
    // suppressHydrationWarning: ThemeScript sets data-ab-theme on <html> before React hydrates.
    <html lang={locale} suppressHydrationWarning>
      <body>
        <ThemeScript />
        <Providers labels={labels} serviceWorker={serviceWorker}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
