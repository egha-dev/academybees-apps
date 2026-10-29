import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { TeachScreen } from '@/components/teach/teach-page.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('scheduling.teach');
  return { title: t('metaTitle') };
}

/**
 * Teacher Today (UX §10, §14; C-06, C-124): the Teacher PWA's home — next class with Take
 * attendance, today, the next 7 days and My batches, read from this device so it opens offline.
 */
export default function TeachPage() {
  return <TeachScreen view="today" />;
}
