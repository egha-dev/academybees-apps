import { formatDate } from '@academybee/i18n';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { loadAcademy } from '@/components/console/academy.server';
import { ResendInvite } from '@/components/console/resend-invite';
import { consoleStaff } from '@/components/console/staff.server';
import { StatusActions } from '@/components/console/status-actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('console.detail.tabs');
  return { title: t('overview'), robots: { index: false, follow: false } };
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack
      component="section"
      spacing={2}
      sx={{
        padding: 5,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'ab.border',
        bgcolor: 'ab.surface',
      }}
    >
      <Text variant="meta" tone="secondary" as="h2">
        {title}
      </Text>
      {children}
    </Stack>
  );
}

/** Overview (UX v1.1 §9): status and why, owner and invitation, plan, setup progress, actions. */
export default async function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [academy, staff, t] = await Promise.all([
    loadAcademy(id),
    consoleStaff(),
    getTranslations('console'),
  ]);
  if (!academy || staff.state !== 'signed-in') return null;
  const date = (iso: string) => formatDate(iso, { timeZone: 'Asia/Kolkata' });
  const inv = academy.owner.invitation;
  const canResend =
    staff.can('platform.tenant.create') &&
    ['PENDING', 'EXPIRED', 'REVOKED'].includes(inv.status) &&
    (academy.status === 'SETUP' || academy.status === 'ACTIVE') &&
    academy.owner.email;

  return (
    <Stack spacing={6}>
      <Box
        sx={{
          display: 'grid',
          gap: 4,
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
        }}
      >
        <Panel title={t('detail.status')}>
          <Text>{t(`status.${academy.status}`)}</Text>
          {academy.statusReason && (
            <Text variant="bodySmall" tone="secondary">
              {t('detail.statusReason', { reason: academy.statusReason })}
            </Text>
          )}
          {academy.statusChangedAt && (
            <Text variant="meta" tone="secondary">
              {t('detail.statusSince', { date: date(academy.statusChangedAt) })}
            </Text>
          )}
          <Text variant="meta" tone="secondary">
            {t('detail.type')}: {t(`types.${academy.academyType as 'other'}`)} ·{' '}
            {t('detail.created', { date: date(academy.createdAt) })}
          </Text>
        </Panel>
        <Panel title={t('detail.owner')}>
          <Text>
            <strong data-i18n-exempt>{academy.owner.name ?? t('detail.ownerUnknown')}</strong>
          </Text>
          {academy.owner.email && (
            <Text variant="bodySmall" tone="secondary">
              <span data-i18n-exempt>{academy.owner.email}</span>
            </Text>
          )}
          <Text variant="bodySmall">{t(`detail.invite.${inv.status}`)}</Text>
          {inv.status === 'PENDING' && inv.expiresAt && (
            <Text variant="meta" tone="secondary">
              {t('detail.inviteExpires', { date: date(inv.expiresAt) })}
            </Text>
          )}
          {canResend && (
            <Box>
              <ResendInvite id={academy.id} email={academy.owner.email ?? ''} />
            </Box>
          )}
        </Panel>
        <Panel title={t('detail.plan')}>
          <Text>{t(`plans.${(academy.plan?.key ?? 'none') as 'trial'}`)}</Text>
          {academy.plan?.trialEndsAt && (
            <Text variant="meta" tone="secondary">
              {t('detail.trialEnds', { date: date(academy.plan.trialEndsAt) })}
            </Text>
          )}
        </Panel>
        <Panel title={t('detail.onboarding')}>
          <Text>
            {t('detail.onboardingProgress', {
              done: academy.onboarding.completedSteps,
              total: academy.onboarding.totalSteps,
            })}
          </Text>
          {academy.onboarding.completedAt && (
            <Text variant="meta" tone="secondary">
              {t('detail.onboardingDone', { date: date(academy.onboarding.completedAt) })}
            </Text>
          )}
        </Panel>
      </Box>
      {staff.can('platform.tenant.suspend') && (
        <Stack component="section" spacing={3} aria-labelledby="academy-actions">
          <Text variant="section" as="h2" id="academy-actions">
            {t('detail.actions.heading')}
          </Text>
          <StatusActions id={academy.id} name={academy.name} status={academy.status} />
        </Stack>
      )}
    </Stack>
  );
}
