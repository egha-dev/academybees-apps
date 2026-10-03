import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@/components/shell/page-header';
import { signedInMember } from '@/components/shell/signed-in.server';
import { roleHomesEnabled } from '@/lib/flags.server';

export const dynamic = 'force-dynamic';

/** Manage home. Phase 5 builds Today; until then the signed-in landing (flag `p2-role-homes`). */
export default async function TodayPage() {
  const [{ me, academy }, roleHomes, t] = await Promise.all([
    signedInMember({ experience: 'manage' }),
    roleHomesEnabled(),
    getTranslations('auth.home'),
  ]);
  if (!roleHomes) notFound();
  return <PageHeader title={t('title', { academy })} body={t('body', { name: me.user.name })} />;
}
