import { Skeleton } from '@academybee/ui/components/display';
import { getTranslations } from 'next-intl/server';

/** Teacher profile skeleton while the page loads (UX §24). */
export default async function TeacherLoading() {
  const t = await getTranslations('people.loading');
  return <Skeleton label={t('teacher')} rows={6} />;
}
