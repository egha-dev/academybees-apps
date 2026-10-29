import type { Metadata } from 'next';

import { TeachScreen, teachMetadata } from '@/components/teach/teach-page.server';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Promise<Metadata> {
  return teachMetadata('sync');
}

/**
 * The Sync Center for owners and admins (C-131, C-133): the roll calls they saved on this device,
 * what is waiting and what needs a decision — the teachers' screen, in the Manage experience.
 */
export default function Page() {
  return <TeachScreen view="sync" experience="manage" syncHref="/attendance/sync" />;
}
