import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { academyName, hostContext } from '@/lib/host-context.server';

/**
 * Route group: academy experiences (`{slug}.academybee.com`, rewritten to /t/{slug} by
 * proxy.ts). Academy identity in the tab title, favicon and installed app (ADR-015, ARCHITECTURE
 * §5.5): the manifest and icons are served per academy at the same paths on its own host.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { context } = await hostContext();
  const name = academyName(context);
  return {
    ...(name ? { title: { default: name, template: `%s · ${name}` }, applicationName: name } : {}),
    manifest: '/manifest.webmanifest',
    icons: { icon: '/academy-icon/icon-192.png', apple: '/academy-icon/apple-180.png' },
    ...(name ? { appleWebApp: { capable: true, title: name, statusBarStyle: 'default' } } : {}),
  };
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
