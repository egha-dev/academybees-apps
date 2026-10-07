import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@/components/shell/page-header';
import { signedInMember } from '@/components/shell/signed-in.server';
import { roleHomesEnabled } from '@/lib/flags.server';

export const dynamic = 'force-dynamic';

/** Teacher home. Phase 6 builds the Teacher PWA; until then the signed-in landing. */
export default async function TeachPage() {
  const [{ me, academy }, roleHomes, t] = await Promise.all([
    signedInMember({ experience: 'teach' }),
    roleHomesEnabled(),
    getTranslations('auth.home'),
  ]);
  // Until the real homes ship, staff land on their Security page (C-68, C-80).
  if (!roleHomes) redirect('/settings/security');
  return <PageHeader title={t('title', { academy })} body={t('body', { name: me.user.name })} />;
}
