import { formatDate } from '@academybee/i18n';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { loadAcademy } from '@/components/console/academy.server';
import { ChangeSubdomain } from '@/components/console/change-subdomain';
import { CopyUrl } from '@/components/console/copy-url';
import { academyUrl, consoleStaff } from '@/components/console/staff.server';
import { hostContext } from '@/lib/host-context.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('console.detail.tabs');
  return { title: t('domain'), robots: { index: false, follow: false } };
}

/**
 * Address (UX v1.1 §9, PRD v3.1 §F): the current AcademyBee address and the old ones that redirect
 * to it. Custom domains aren't offered yet (C-95).
 */
export default async function DomainPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [academy, staff, t, { apexUrl }] = await Promise.all([
    loadAcademy(id),
    consoleStaff(),
    getTranslations('console'),
    hostContext(),
  ]);
  if (!academy || staff.state !== 'signed-in') return null;
  const url = academyUrl(apexUrl, academy.host);
  const redirects = academy.domains.filter((d) => d.role === 'REDIRECT');
  let rootDomain = '';
  try {
    rootDomain = new URL(apexUrl).host;
  } catch {
    rootDomain = academy.host.split('.').slice(1).join('.');
  }
  const date = (iso: string) => formatDate(iso, { timeZone: 'Asia/Kolkata' });
  return (
    <Stack spacing={8}>
      <Stack spacing={2}>
        <Text variant="section" as="h2">
          {t('domain.current')}
        </Text>
        <Text tone="secondary">{t('domain.currentHint')}</Text>
        <Text>
          <strong data-i18n-exempt data-testid="current-address">
            {url}
          </strong>
        </Text>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
          <CopyUrl url={url} />
          {staff.can('platform.tenant.domain') && academy.status !== 'ARCHIVED' && (
            <ChangeSubdomain
              id={academy.id}
              name={academy.name}
              current={academy.slug}
              rootDomain={rootDomain}
            />
          )}
        </Stack>
      </Stack>
      <Stack spacing={2}>
        <Text variant="section" as="h2">
          {t('domain.redirects')}
        </Text>
        <Text tone="secondary">{t('domain.redirectsHint')}</Text>
        {redirects.length === 0 ? (
          <Text variant="bodySmall" tone="secondary">
            {t('domain.noRedirects')}
          </Text>
        ) : (
          <Box component="ul" sx={{ margin: 0, paddingInlineStart: 5 }}>
            {redirects.map((d) => (
              <li key={d.host}>
                <Text variant="bodySmall">
                  <span data-i18n-exempt>{d.host}</span> · {date(d.createdAt)}
                </Text>
              </li>
            ))}
          </Box>
        )}
      </Stack>
    </Stack>
  );
}
