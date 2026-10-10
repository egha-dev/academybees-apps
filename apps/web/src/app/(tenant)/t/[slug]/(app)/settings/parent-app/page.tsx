import { PermissionState } from '@academybee/ui/components/feedback';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import QRCode from 'qrcode';

import { SettingsTabs } from '@/components/academy/settings-tabs';
import { PrintButton } from '@/components/people/print-button';
import { PageHeader } from '@/components/shell/page-header';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { familyLinkEnabled } from '@/lib/flags.server';
import { academyName, hostContext, hubOrigin } from '@/lib/host-context.server';
import { homeFor } from '@/lib/session.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('people.parentApp');
  return { title: t('metaTitle') };
}

/**
 * Settings → Parent app (G-31 §2): a printable "Join us on AcademyBee" poster whose QR code opens
 * `app.<root>/join/<slug>` on the Family Hub. Drawn on the server (no client JS). Scanning never
 * grants access by itself (C-107).
 */
export default async function ParentAppPage() {
  const [{ me, academy }, enabled, { context, apexUrl }, t, academyT, shellT] = await Promise.all([
    signedInMember({ experience: 'manage' }),
    familyLinkEnabled(),
    hostContext(),
    getTranslations('people.parentApp'),
    getTranslations('academy'),
    getTranslations('shell.permission'),
  ]);
  if (!enabled) notFound();
  if (!holds(me, 'academy.settings.read'))
    return (
      <PermissionState
        title={academyT('settings.permission.title')}
        body={academyT('settings.permission.body', { academy })}
        action={{ label: shellT('action'), href: homeFor(me) }}
      />
    );
  const name = academyName(context) ?? academy;
  const slug = context && 'slug' in context ? context.slug : '';
  const hub = hubOrigin(apexUrl) ?? '';
  const joinUrl = `${hub}/join/${slug}`;
  const svg = await QRCode.toString(joinUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
  const qr = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return (
    <Stack spacing={6}>
      <Box sx={{ '@media print': { display: 'none' } }}>
        <Stack spacing={6}>
          <PageHeader title={academyT('settings.title')} body={academyT('settings.body')} />
          <SettingsTabs current="parentApp" />
          <Stack spacing={2}>
            <Text variant="section" as="h2">
              {t('title')}
            </Text>
            <Text tone="secondary">{t('body', { academy: name })}</Text>
            <Text tone="secondary">{t('requests')}</Text>
            <Box>
              <PrintButton label={t('print')} />
            </Box>
          </Stack>
        </Stack>
      </Box>
      <Box
        component="section"
        aria-label={t('posterTitle', { academy: name })}
        sx={{
          maxInlineSize: 520,
          marginInline: 'auto',
          padding: 6,
          border: '1px solid',
          borderColor: 'ab.border',
          borderRadius: 3,
          bgcolor: '#FFFFFF',
          color: '#171817',
          textAlign: 'center',
          '@media print': { border: 0, maxInlineSize: 'none', padding: 0 },
        }}
      >
        <Stack spacing={3} sx={{ alignItems: 'center' }}>
          <Box component="h2" sx={{ margin: 0, fontSize: 28, lineHeight: 1.25 }}>
            {t('posterTitle', { academy: name })}
          </Box>
          <Box component="p" sx={{ margin: 0, fontSize: 16 }}>
            {t('posterBody')}
          </Box>
          <Box
            component="img"
            src={qr}
            alt={t('qrAlt', { academy: name })}
            sx={{ inlineSize: 280, blockSize: 280 }}
          />
          <Box component="p" sx={{ margin: 0, fontSize: 14, wordBreak: 'break-all' }}>
            {t('orType', { url: joinUrl.replace(/^https?:\/\//, '') })}
          </Box>
        </Stack>
      </Box>
    </Stack>
  );
}
