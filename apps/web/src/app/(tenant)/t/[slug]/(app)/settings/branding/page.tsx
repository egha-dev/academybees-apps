import { AcademyBrandingSchema } from '@academybee/contracts';
import { PermissionState } from '@academybee/ui/components/feedback';
import { Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { getMessages, getTranslations } from 'next-intl/server';

import { BrandingLazy } from '@/components/academy/academy-lazy';
import type { BrandingLabels } from '@/components/academy/branding-editor';
import { SettingsTabs } from '@/components/academy/settings-tabs';
import { PageHeader } from '@/components/shell/page-header';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { academyUrl } from '@/lib/academy-url';
import { apiServerGet } from '@/lib/api.server';
import { hostContext } from '@/lib/host-context.server';
import { homeFor } from '@/lib/session.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('academy.branding');
  return { title: t('metaTitle') };
}

/**
 * Branding & address (UX v1.1 §6, V1.2 §5): logo, browser icon, brand colour with a preview in
 * both themes, and the AcademyBee address (changed only from the console; custom domains aren't
 * offered yet, C-95).
 */
export default async function BrandingPage() {
  const [{ me, academy }, t, shellT, { apexUrl }, messages] = await Promise.all([
    signedInMember({ experience: 'manage' }),
    getTranslations('academy'),
    getTranslations('shell.permission'),
    hostContext(),
    getMessages(),
  ]);
  if (!holds(me, 'academy.settings.read'))
    return (
      <PermissionState
        title={t('branding.permission.title')}
        body={t('branding.permission.body', { academy })}
        action={{ label: shellT('action'), href: homeFor(me) }}
      />
    );
  const res = await apiServerGet('/academy/branding');
  if (!res.ok) throw new Error(`academy branding ${res.status}`);
  const value = AcademyBrandingSchema.parse(await res.json());
  const canManage = holds(me, 'academy.branding.manage');
  const b = messages.academy.branding;
  const labels: BrandingLabels = {
    unavailable: b.unavailable,
    logo: b.logo,
    favicon: b.favicon,
    colour: b.colour,
    preview: b.preview,
    address: b.address,
    errors: messages.academy.errors,
  };
  return (
    <Stack spacing={6}>
      <PageHeader title={t('branding.title')} body={t('branding.body')} />
      <SettingsTabs current="branding" />
      {!canManage && <Text tone="secondary">{t('branding.readOnly')}</Text>}
      <BrandingLazy
        value={value}
        name={value.displayName}
        url={academyUrl(apexUrl, value.host)}
        canManage={canManage}
        labels={labels}
      />
    </Stack>
  );
}
