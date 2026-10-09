import { formatDate } from '@academybee/i18n';
import { Button } from '@academybee/ui/components/actions';
import { ErrorState } from '@academybee/ui/components/feedback';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { CheckCircleIcon, OpenInNewIcon } from '@academybee/ui/icons';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { loadAcademy } from '@/components/console/academy.server';
import { CopyUrl } from '@/components/console/copy-url';
import { academyUrl } from '@/components/console/staff.server';
import { hostContext } from '@/lib/host-context.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('console.created');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Stack spacing={0.5}>
      <Text variant="meta" tone="secondary">
        {label}
      </Text>
      <Text>{value}</Text>
    </Stack>
  );
}

/**
 * Provisioning Success (UX v1.1 §3): a premium activation moment, not a deployment log — the
 * academy's address up front with Copy and Open, then the owner invitation, plan and setup.
 */
export default async function CreatedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [academy, t, { apexUrl }] = await Promise.all([
    loadAcademy(id),
    getTranslations('console'),
    hostContext(),
  ]);
  if (!academy)
    return (
      <ErrorState
        title={t('errors.loadTitle')}
        body={t('errors.unavailable')}
        retry={{ label: t('created.view'), href: `/academies/${id}/overview` }}
      />
    );
  const url = academyUrl(apexUrl, academy.host);
  const date = (iso: string) => formatDate(iso, { timeZone: 'Asia/Kolkata' });
  return (
    <Stack spacing={8} sx={{ maxInlineSize: 720 }}>
      <Stack spacing={3}>
        <Box sx={{ color: 'ab.status.success.fg', '& svg': { fontSize: 40 } }} aria-hidden>
          <CheckCircleIcon />
        </Box>
        <Text variant="title" as="h1">
          {t('created.title', { academy: academy.name })}
        </Text>
        <Text tone="secondary">{t('created.body')}</Text>
      </Stack>
      <Stack
        spacing={3}
        sx={{
          padding: 5,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'ab.border',
          bgcolor: 'ab.surface',
        }}
      >
        <Text variant="meta" tone="secondary">
          {t('created.url')}
        </Text>
        <Text variant="title" as="p">
          <Box
            component="span"
            data-i18n-exempt
            data-testid="academy-url"
            sx={{ wordBreak: 'break-all' }}
          >
            {url}
          </Box>
        </Text>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
          <CopyUrl url={url} />
          <Button href={url} startIcon={<OpenInNewIcon />}>
            {t('created.open')}
          </Button>
        </Stack>
      </Stack>
      <Box
        sx={{
          display: 'grid',
          gap: 5,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
        }}
      >
        <Fact
          label={t('detail.owner')}
          value={t(`detail.invite.${academy.owner.invitation.status}`)}
        />
        <Fact
          label={t('detail.plan')}
          value={
            academy.plan?.trialEndsAt
              ? `${t(`plans.${academy.plan.key as 'trial'}`)} · ${t('detail.trialEnds', { date: date(academy.plan.trialEndsAt) })}`
              : t(`plans.${(academy.plan?.key ?? 'none') as 'trial'}`)
          }
        />
        <Fact
          label={t('detail.onboarding')}
          value={t('detail.onboardingProgress', {
            done: academy.onboarding.completedSteps,
            total: academy.onboarding.totalSteps,
          })}
        />
      </Box>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
        <Button variant="secondary" href={`/academies/${academy.id}/overview`}>
          {t('created.view')}
        </Button>
        <Button variant="ghost" href="/academies">
          {t('created.back')}
        </Button>
      </Stack>
    </Stack>
  );
}
