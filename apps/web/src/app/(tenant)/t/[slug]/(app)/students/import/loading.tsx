import { Skeleton } from '@academybee/ui/components/display';
import { getTranslations } from 'next-intl/server';

/** Import skeleton while the page loads (UX §24). */
export default async function ImportLoading() {
  const t = await getTranslations('people.loading');
  return <Skeleton label={t('import')} rows={4} />;
}
