import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { StatusPage } from '@/components/status-page';
import { academyName, hostContext } from '@/lib/host-context.server';

/** Tenant access denied (UX v1.1 §7). Phase 2 sends signed-in users here when a role lacks access. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('tenant.status.accessDenied');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

export default async function AccessDenied() {
  const [{ context }, t] = await Promise.all([hostContext(), getTranslations('tenant.status')]);
  const name = academyName(context);
  return (
    <StatusPage
      academyName={name}
      tone="lock"
      title={t('accessDenied.title')}
      body={t('accessDenied.body', { academy: name ?? t('fallbackAcademy') })}
      action={{ label: t('accessDenied.action'), href: '/' }}
    />
  );
}
