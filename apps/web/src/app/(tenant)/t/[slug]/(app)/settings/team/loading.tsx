import { Skeleton } from '@academybee/ui/components/display';
import { getTranslations } from 'next-intl/server';

/** Team skeleton while members and invitations load (UX §24). */
export default async function TeamLoading() {
  const t = await getTranslations('team');
  return <Skeleton label={t('loading')} rows={5} />;
}
