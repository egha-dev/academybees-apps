import { FeePlanListSchema, localDate } from '@academybee/contracts';
import { formatMoney } from '@academybee/i18n';
import { Card } from '@academybee/ui/components/display';
import { EmptyState, PermissionState } from '@academybee/ui/components/feedback';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { OneTimeSheetLazy, PlanSheetLazy } from '@/components/finance/finance-lazy';
import { financeLabels } from '@/components/finance/labels.server';
import { PageHeader } from '@/components/shell/page-header';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { apiServerGet } from '@/lib/api.server';
import { flagEnabled } from '@/lib/flags.server';
import { academyTimeZone, hostContext } from '@/lib/host-context.server';
import { homeFor } from '@/lib/session.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance.ui.plans');
  return { title: t('metaTitle') };
}

/** Fees (UX §13, G-04): what the academy charges; each plan opens to who pays it. */
export default async function FeesPage() {
  if (!(await flagEnabled('p7-finance', (await headers()).get('host') ?? ''))) notFound();
  const [{ me, academy }, t, academyT, shellT, labels, { context }] = await Promise.all([
    signedInMember({ experience: 'manage' }),
    getTranslations('finance.ui.plans'),
    getTranslations('academy'),
    getTranslations('shell.permission'),
    financeLabels(),
    hostContext(),
  ]);
  if (!holds(me, 'fee.read'))
    return (
      <PermissionState
        title={academyT('settings.permission.title')}
        body={academyT('settings.permission.body', { academy })}
        action={{ label: shellT('action'), href: homeFor(me) }}
      />
    );
  const [activeRes, archivedRes] = await Promise.all([
    apiServerGet('/fee-plans'),
    apiServerGet('/fee-plans?status=ARCHIVED'),
  ]);
  if (!activeRes.ok || !archivedRes.ok) throw new Error('fee plans');
  const { items } = FeePlanListSchema.parse(await activeRes.json());
  const { items: archived } = FeePlanListSchema.parse(await archivedRes.json());
  const canManage = holds(me, 'fee.manage');
  const canCharge = holds(me, 'invoice.create') && holds(me, 'invoice.issue');
  const today = localDate(new Date(), academyTimeZone(context) ?? 'Asia/Kolkata');
  return (
    <Stack spacing={6}>
      <PageHeader
        title={t('title')}
        body={t('body')}
        action={
          <Stack direction="row" spacing={2}>
            {canCharge && <OneTimeSheetLazy today={today} labels={labels.oneTime} />}
            {canManage && <PlanSheetLazy labels={labels.plans} />}
          </Stack>
        }
      />
      {items.length === 0 ? (
        canManage ? (
          <Box>
            <EmptyState title={t('empty.title')} body={t('empty.body')} />
          </Box>
        ) : (
          <Text tone="secondary">{t('emptyReadOnly')}</Text>
        )
      ) : (
        <Stack component="ul" spacing={3} sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {items.map((p) => (
            <Box component="li" key={p.id}>
              <Card
                title={p.name}
                subtitle={`${formatMoney(p.totalMinor, p.currency, { compact: true })} ${
                  p.cycle === 'CUSTOM'
                    ? t('perCycle.CUSTOM', { months: String(p.cycleMonths ?? '') })
                    : t(`perCycle.${p.cycle}`)
                }`}
              >
                <Box
                  component="a"
                  href={`/fees/${p.id}`}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    minBlockSize: 48,
                    color: 'ab.textPrimary',
                    fontWeight: 600,
                  }}
                >
                  {t('students', { count: p.assignedCount })}
                </Box>
              </Card>
            </Box>
          ))}
        </Stack>
      )}
      {archived.length > 0 && (
        <Stack spacing={1}>
          <Text variant="section" as="h2">
            {t('archivedTitle')}
          </Text>
          <Stack component="ul" spacing={1} sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {archived.map((p) => (
              <Box component="li" key={p.id}>
                <Box
                  component="a"
                  href={`/fees/${p.id}`}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    minBlockSize: 48,
                    color: 'ab.textSecondary',
                  }}
                >
                  {p.name}
                </Box>
              </Box>
            ))}
          </Stack>
        </Stack>
      )}
    </Stack>
  );
}
