import { InlineAlert } from '@academybee/ui/components/alert';
import { PermissionState } from '@academybee/ui/components/feedback';
import { Box, Stack } from '@academybee/ui/components/layout';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { SettingsTabs } from '@/components/academy/settings-tabs';
import { loadPrivacyNotice, PrivacyNoticeBody } from '@/components/people/privacy-notice.server';
import { PageHeader } from '@/components/shell/page-header';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { homeFor } from '@/lib/session.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('people.privacy');
  return { title: t('metaTitle') };
}

/** Settings → Privacy notice (G-06): what parents see, with its version. */
export default async function PrivacySettingsPage() {
  const [{ me, academy }, t, academyT, shellT, notice] = await Promise.all([
    signedInMember({ experience: 'manage' }),
    getTranslations('people.privacy'),
    getTranslations('academy'),
    getTranslations('shell.permission'),
    loadPrivacyNotice(),
  ]);
  if (!holds(me, 'academy.settings.read'))
    return (
      <PermissionState
        title={academyT('settings.permission.title')}
        body={academyT('settings.permission.body', { academy })}
        action={{ label: shellT('action'), href: homeFor(me) }}
      />
    );
  if (!notice) throw new Error('privacy notice unavailable');
  return (
    <Stack spacing={6}>
      <PageHeader title={academyT('settings.title')} body={academyT('settings.body')} />
      <SettingsTabs current="privacy" />
      <Stack spacing={2}>
        <Text variant="section" as="h2">
          {t('title')}
        </Text>
        <Text tone="secondary">{t('settingsBody')}</Text>
        {(!notice.email || !notice.phone) && (
          <InlineAlert tone="warning">{t('contactMissing')}</InlineAlert>
        )}
        <Box>
          <PlainButton href="/privacy">{t('open')}</PlainButton>
        </Box>
      </Stack>
      <Box
        sx={{
          padding: 4,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'ab.border',
          bgcolor: 'ab.surface',
        }}
      >
        <PrivacyNoticeBody notice={notice} />
      </Box>
    </Stack>
  );
}
