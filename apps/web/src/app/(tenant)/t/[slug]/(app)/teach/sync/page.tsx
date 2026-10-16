import type { Metadata } from 'next';

import { TeachScreen, teachMetadata } from '@/components/teach/teach-page.server';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Promise<Metadata> {
  return teachMetadata('sync');
}

/** Teacher PWA: sync (C-124; renders from this device's data). */
export default function Page() {
  return <TeachScreen view="sync" />;
}
