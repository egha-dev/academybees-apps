import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { AuthFrame } from '@/components/auth/auth-frame';
import { loadPrivacyNotice, PrivacyNoticeBody } from '@/components/people/privacy-notice.server';
import { familyLinkEnabled } from '@/lib/flags.server';
import { academyColor, academyLogo, academyName, hostContext } from '@/lib/host-context.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('people.privacy');
  return { title: t('metaTitle') };
}

/** The academy's public privacy notice (G-06), linked from sign-in and shown before consent. */
export default async function PrivacyPage() {
  const [{ context }, enabled, t, notice] = await Promise.all([
    hostContext(),
    familyLinkEnabled(),
    getTranslations('people.privacy'),
    loadPrivacyNotice(),
  ]);
  const academy = academyName(context);
  if (!enabled || !academy || !notice) notFound();
  return (
    <AuthFrame
      academy={academy}
      primaryColor={academyColor(context)}
      logoUrl={academyLogo(context)}
      title={t('title')}
      body={t('subtitle', { academy })}
    >
      <PrivacyNoticeBody notice={notice} />
    </AuthFrame>
  );
}
