import { TextLink } from '@academybee/ui/components/actions';
import { StatusBadge } from '@academybee/ui/components/display';
import { ErrorState } from '@academybee/ui/components/feedback';
import { Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { getTranslations } from 'next-intl/server';
import { type ReactNode } from 'react';

import { loadAcademy } from '@/components/console/academy.server';
import { AcademyTabs } from '@/components/console/academy-tabs';
import { STATUS_TONE } from '@/components/console/status-tone';

/** Academy detail frame (C-02, UX v1.1 §9): name, status, address, then Overview · Address. */
export default async function AcademyLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [academy, t] = await Promise.all([loadAcademy(id), getTranslations('console')]);
  if (!academy)
    return (
      <ErrorState
        title={t('errors.loadTitle')}
        body={t('errors.unavailable')}
        retry={{ label: t('detail.back'), href: '/academies' }}
      />
    );
  return (
    <Stack spacing={6}>
      <TextLink href="/academies">{t('detail.back')}</TextLink>
      <Stack spacing={1}>
        <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 3 }}>
          <Text variant="title" as="h1">
            <span data-i18n-exempt>{academy.name}</span>
          </Text>
          <StatusBadge
            tone={STATUS_TONE[academy.status] ?? 'neutral'}
            label={t(`status.${academy.status}`)}
          />
        </Stack>
        <Text tone="secondary">
          <span data-i18n-exempt>{academy.host}</span>
        </Text>
      </Stack>
      <AcademyTabs
        label={t('detail.tabs.label')}
        tabs={[
          { href: `/academies/${id}/overview`, label: t('detail.tabs.overview') },
          { href: `/academies/${id}/domain`, label: t('detail.tabs.domain') },
        ]}
      />
      {children}
    </Stack>
  );
}
