import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { TeachScreen } from '@/components/teach/teach-page.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('teach.staff');
  return { title: t('takeMeta') };
}

/**
 * Owners and admins take attendance with the teachers' screen and the same sync queue (C-131):
 * one code path, online or offline.
 */
export default function TakeAttendancePage() {
  return (
    <TeachScreen
      view="attendance"
      experience="manage"
      backHref="/attendance"
      syncHref="/attendance/sync"
    />
  );
}
