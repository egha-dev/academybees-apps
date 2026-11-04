import { FinanceSettingsResponseSchema } from '@academybee/contracts';
import { PermissionState } from '@academybee/ui/components/feedback';
import { Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getMessages, getTranslations } from 'next-intl/server';

import { SettingsTabs } from '@/components/academy/settings-tabs';
import { FinanceSettingsLazy } from '@/components/finance/finance-lazy';
import { PageHeader } from '@/components/shell/page-header';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { apiServerGet } from '@/lib/api.server';
import { flagEnabled } from '@/lib/flags.server';
import { homeFor } from '@/lib/session.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance.ui.settings');
  return { title: t('metaTitle') };
}

/** Settings → Payments (G-30, ADR-038): anyone with `fee.read` looks; the owner changes. */
export default async function PaymentsSettingsPage() {
  if (!(await flagEnabled('p7-finance', (await headers()).get('host') ?? ''))) notFound();
  const [{ me, academy }, t, academyT, shellT, messages] = await Promise.all([
    signedInMember({ experience: 'manage' }),
    getTranslations('finance.ui.settings'),
    getTranslations('academy'),
    getTranslations('shell.permission'),
    getMessages(),
  ]);
  if (!holds(me, 'fee.read'))
    return (
      <PermissionState
        title={academyT('settings.permission.title')}
        body={academyT('settings.permission.body', { academy })}
        action={{ label: shellT('action'), href: homeFor(me) }}
      />
    );
  const res = await apiServerGet('/settings/finance');
  if (!res.ok) throw new Error(`finance settings ${res.status}`);
  const value = FinanceSettingsResponseSchema.parse(await res.json());
  const canManage = holds(me, 'academy.settings.manage');
  return (
    <Stack spacing={6}>
      <PageHeader title={t('title')} body={t('body')} />
      <SettingsTabs current="payments" />
      {!canManage && <Text tone="secondary">{t('readOnly')}</Text>}
      <FinanceSettingsLazy
        value={value}
        canManage={canManage}
        labels={{
          ...messages.finance.ui.settings,
          errors: {
            finance: messages.finance.ui.errors,
            people: { ...messages.people.errors, offline: messages.people.form.offline },
          },
        }}
      />
    </Stack>
  );
}
