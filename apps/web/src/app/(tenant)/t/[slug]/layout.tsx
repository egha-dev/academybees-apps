import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { academyName, hostContext } from '@/lib/host-context.server';

/**
 * Route group: academy experiences (`{slug}.academybees.com`, rewritten to /t/{slug} by
 * proxy.ts). Academy identity in the tab title, favicon and installed app (ADR-015, ARCHITECTURE
 * §5.5): the manifest and icons are served per academy at the same paths on its own host.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { context } = await hostContext();
  const name = academyName(context);
  // An uploaded favicon (C-97) shows in browser tabs; the installed-app icons stay generated from
  // the initials, because they need fixed sizes we don't produce (no image resizing on R2).
  const favicon = context && 'branding' in context ? context.branding.faviconUrl : null;
  return {
    ...(name ? { title: { default: name, template: `%s · ${name}` }, applicationName: name } : {}),
    manifest: '/manifest.webmanifest',
    icons: { icon: favicon ?? '/academy-icon/icon-192.png', apple: '/academy-icon/apple-180.png' },
    ...(name ? { appleWebApp: { capable: true, title: name, statusBarStyle: 'default' } } : {}),
  };
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
