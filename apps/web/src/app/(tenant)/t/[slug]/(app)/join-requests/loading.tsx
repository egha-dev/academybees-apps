import { Skeleton } from '@academybee/ui/components/display';
import { getTranslations } from 'next-intl/server';

/** Join requests skeleton while the page loads (UX §24). */
export default async function JoinrequestsLoading() {
  const t = await getTranslations('people.loading');
  return <Skeleton label={t('joinRequests')} rows={4} />;
}
