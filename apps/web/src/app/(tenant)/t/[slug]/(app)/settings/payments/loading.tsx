import { Skeleton } from '@academybee/ui/components/display';
import { getTranslations } from 'next-intl/server';

/** Skeleton while the page loads (UX §24). */
export default async function Loading() {
  const t = await getTranslations('finance.ui.loading');
  return <Skeleton label={t('settings')} rows={6} />;
}
