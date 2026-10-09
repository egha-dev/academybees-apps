import { Skeleton } from '@academybee/ui/components/display';
import { getTranslations } from 'next-intl/server';

export default async function Loading() {
  const t = await getTranslations('common.states');
  return <Skeleton label={t('loading')} rows={5} />;
}
