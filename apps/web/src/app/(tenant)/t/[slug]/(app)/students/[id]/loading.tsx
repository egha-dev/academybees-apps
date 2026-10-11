import { Skeleton } from '@academybee/ui/components/display';
import { getTranslations } from 'next-intl/server';

/** Student 360 skeleton while the page loads (UX §24). */
export default async function StudentLoading() {
  const t = await getTranslations('people.loading');
  return <Skeleton label={t('student')} rows={6} />;
}
