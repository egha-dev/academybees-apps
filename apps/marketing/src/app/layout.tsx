import '@fontsource-variable/inter';
import './globals.css';

import { ThemeScript } from '@academybee/ui/theme-script';
import { palettes } from '@academybee/ui/tokens';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { SITE_URL, t } from '@/lib/site';
import { THEME_CSS } from '@/lib/theme-css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: t('meta.title'), template: '%s · AcademyBee' },
  description: t('meta.description'),
  applicationName: 'AcademyBee',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'AcademyBee',
    locale: 'en_IN',
    url: '/',
    title: t('meta.title'),
    description: t('meta.description'),
  },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: palettes.light.background },
    { media: '(prefers-color-scheme: dark)', color: palettes.dark.background },
  ],
  width: 'device-width',
  initialScale: 1,
};

/** academybees.com (C-74): static, English for now, light and dark from the app's tokens. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the theme script sets data-ab-theme on <html> before hydration.
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <style>{THEME_CSS}</style>
      </head>
      <body>
        <ThemeScript />
        {children}
      </body>
    </html>
  );
}
