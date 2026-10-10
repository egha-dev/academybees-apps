import { CustomFieldListSchema, MAX_CUSTOM_FIELDS } from '@academybee/contracts';
import { PermissionState } from '@academybee/ui/components/feedback';
import { Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMessages, getTranslations } from 'next-intl/server';

import { SettingsTabs } from '@/components/academy/settings-tabs';
import { CustomFieldsEditorLazy } from '@/components/people/students-lazy';
import { PageHeader } from '@/components/shell/page-header';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { apiServerGet } from '@/lib/api.server';
import { peopleEnabled } from '@/lib/flags.server';
import { homeFor } from '@/lib/session.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('people.fields');
  return { title: t('metaTitle') };
}

/** Settings → Custom fields (G-05): read by admins, changed by the owner. Online only. */
export default async function CustomFieldsPage() {
  const [{ me, academy }, enabled, t, academyT, shellT, messages] = await Promise.all([
    signedInMember({ experience: 'manage' }),
    peopleEnabled(),
    getTranslations('people.fields'),
    getTranslations('academy'),
    getTranslations('shell.permission'),
    getMessages(),
  ]);
  if (!enabled) notFound();
  if (!holds(me, 'academy.settings.read') || !holds(me, 'student.read'))
    return (
      <PermissionState
        title={academyT('settings.permission.title')}
        body={academyT('settings.permission.body', { academy })}
        action={{ label: shellT('action'), href: homeFor(me) }}
      />
    );
  const res = await apiServerGet('/custom-fields');
  if (!res.ok) throw new Error(`custom fields ${res.status}`);
  const { items } = CustomFieldListSchema.parse(await res.json());
  const p = messages.people;
  return (
    <Stack spacing={6}>
      <PageHeader title={academyT('settings.title')} body={academyT('settings.body')} />
      <SettingsTabs current="fields" />
      <Stack spacing={1}>
        <Text variant="section" as="h2">
          {t('title')}
        </Text>
        <Text tone="secondary">{t('body', { max: MAX_CUSTOM_FIELDS })}</Text>
      </Stack>
      <CustomFieldsEditorLazy
        fields={items}
        max={MAX_CUSTOM_FIELDS}
        canManage={holds(me, 'academy.settings.manage')}
        labels={{
          fields: p.fields,
          form: p.form,
          errors: { ...p.errors, offline: p.form.offline },
        }}
      />
    </Stack>
  );
}
