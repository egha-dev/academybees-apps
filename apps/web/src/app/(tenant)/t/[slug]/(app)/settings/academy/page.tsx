import { AcademySettingsSchema } from '@academybee/contracts';
import { PermissionState } from '@academybee/ui/components/feedback';
import { Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { getMessages, getTranslations } from 'next-intl/server';

import { AcademyProfileLazy } from '@/components/academy/academy-lazy';
import { SettingsTabs } from '@/components/academy/settings-tabs';
import { PageHeader } from '@/components/shell/page-header';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { apiServerGet } from '@/lib/api.server';
import { homeFor } from '@/lib/session.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('academy.settings');
  return { title: t('metaTitle') };
}

/** Settings → Academy (UX v1.1 §6): read by admins, changed by the owner. Online only. */
export default async function AcademySettingsPage() {
  const [{ me, academy }, t, shellT, messages] = await Promise.all([
    signedInMember({ experience: 'manage' }),
    getTranslations('academy'),
    getTranslations('shell.permission'),
    getMessages(),
  ]);
  if (!holds(me, 'academy.settings.read'))
    return (
      <PermissionState
        title={t('settings.permission.title')}
        body={t('settings.permission.body', { academy })}
        action={{ label: shellT('action'), href: homeFor(me) }}
      />
    );
  const res = await apiServerGet('/academy/settings');
  if (!res.ok) throw new Error(`academy settings ${res.status}`);
  const value = AcademySettingsSchema.parse(await res.json());
  const canManage = holds(me, 'academy.settings.manage');
  return (
    <Stack spacing={6}>
      <PageHeader title={t('settings.title')} body={t('settings.body')} />
      <SettingsTabs current="academy" />
      {!canManage && <Text tone="secondary">{t('settings.readOnly')}</Text>}
      <AcademyProfileLazy
        value={value}
        canManage={canManage}
        labels={{
          fields: messages.academy.settings.fields,
          save: t('settings.save'),
          saved: t('settings.saved'),
          errors: messages.academy.errors,
        }}
      />
    </Stack>
  );
}
