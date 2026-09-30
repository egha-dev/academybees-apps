import '@fontsource-variable/inter';
import './globals.css';

import { color } from '@academybee/ui/tokens';
import type { Metadata, Viewport } from 'next';
import { getLocale, getMessages, getTimeZone, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { Providers } from '@/components/providers';

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
  const [locale, timeZone, messages] = await Promise.all([
    getLocale(),
    getTimeZone(),
    getMessages(),
  ]);
  // The service worker is off in `next dev` (stale caches confuse development) and on in builds.
  const serviceWorker = process.env.NODE_ENV === 'production';
  return (
    <html lang={locale}>
      <body>
        <Providers
          locale={locale}
          timeZone={timeZone}
          messages={messages}
          serviceWorker={serviceWorker}
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
