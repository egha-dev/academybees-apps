import { Skeleton } from '@academybee/ui/components/display';
import { getTranslations } from 'next-intl/server';

/** Teachers list skeleton while the page loads (UX §24). */
export default async function TeachersLoading() {
  const t = await getTranslations('people.loading');
  return <Skeleton label={t('teachers')} rows={6} />;
}
