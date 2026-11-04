import { FeeAssignmentListSchema, FeePlanSchema, localDate } from '@academybee/contracts';
import { formatDate, formatMoney } from '@academybee/i18n';
import { Card } from '@academybee/ui/components/display';
import { EmptyState, PermissionState } from '@academybee/ui/components/feedback';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import {
  AssignSheetLazy,
  EndAssignmentLazy,
  PlanSheetLazy,
  PlanStatusLazy,
} from '@/components/finance/finance-lazy';
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

/** One fee plan: its items, and the students on it (G-04). */
export default async function FeePlanPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await flagEnabled('p7-finance', (await headers()).get('host') ?? ''))) notFound();
  const { id } = await params;
  const [{ me, academy }, t, a, academyT, shellT, labels, { context }] = await Promise.all([
    signedInMember({ experience: 'manage' }),
    getTranslations('finance.ui.plans'),
    getTranslations('finance.ui.assignments'),
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
  const [planRes, listRes] = await Promise.all([
    apiServerGet(`/fee-plans/${encodeURIComponent(id)}`),
    apiServerGet(`/fee-assignments?planId=${encodeURIComponent(id)}`),
  ]);
  if (planRes.status === 404 || planRes.status === 400 || listRes.status === 400)
    return (
      <EmptyState
        title={a('notFoundTitle')}
        body={a('notFoundBody')}
        action={{ label: a('back'), href: '/fees' }}
      />
    );
  if (!planRes.ok || !listRes.ok) throw new Error('fee plan');
  const plan = FeePlanSchema.parse(await planRes.json());
  const { items } = FeeAssignmentListSchema.parse(await listRes.json());
  const canManage = holds(me, 'fee.manage');
  const zone = academyTimeZone(context) ?? 'Asia/Kolkata';
  const today = localDate(new Date(), zone);
  const money = (minor: number) => formatMoney(minor, plan.currency, { compact: true });
  return (
    <Stack spacing={6}>
      <Box component="a" href="/fees" sx={{ color: 'ab.textSecondary', fontSize: 14 }}>
        {a('back')}
      </Box>
      <PageHeader
        title={plan.name}
        body={`${money(plan.totalMinor)} ${
          plan.cycle === 'CUSTOM'
            ? t('perCycle.CUSTOM', { months: String(plan.cycleMonths ?? '') })
            : t(`perCycle.${plan.cycle}`)
        }`}
        action={
          canManage ? (
            <Stack direction="row" spacing={2}>
              <PlanStatusLazy
                plan={plan}
                body={t('archiveBody', { count: plan.assignedCount })}
                labels={labels.plans}
              />
              {plan.status === 'ACTIVE' && (
                <>
                  <PlanSheetLazy plan={plan} labels={labels.plans} variant="link" />
                  <AssignSheetLazy
                    planId={plan.id}
                    planName={plan.name}
                    today={today}
                    labels={labels.assign}
                  />
                </>
              )}
            </Stack>
          ) : undefined
        }
      />
      <Card title={t('componentsLegend')}>
        <Stack component="ul" spacing={1} sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {plan.components.map((c) => (
            <Box
              component="li"
              key={c.id}
              sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}
            >
              <span>{c.name}</span>
              <span>{money(c.amountMinor)}</span>
            </Box>
          ))}
        </Stack>
      </Card>
      <Stack spacing={3}>
        <Text variant="section" as="h2">
          {a('title')}
        </Text>
        {items.length === 0 ? (
          <Text tone="secondary">{a('empty')}</Text>
        ) : (
          <Stack component="ul" spacing={2} sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {items.map((x) => (
              <Box
                component="li"
                key={x.id}
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 2,
                  padding: 3,
                  border: '1px solid',
                  borderColor: 'ab.border',
                  borderRadius: 2,
                }}
              >
                <Stack spacing={0.5}>
                  <Box
                    component="a"
                    href={`/students/${x.studentId}`}
                    sx={{ color: 'ab.textPrimary', fontWeight: 600 }}
                  >
                    {x.studentName}
                  </Box>
                  <Text variant="meta" tone="secondary">
                    {a('from', { date: formatDate(x.startsOn) })}
                    {x.endsOn ? ` ${a('until', { date: formatDate(x.endsOn) })}` : ''}
                    {x.discount
                      ? ` · ${a('discount', {
                          value:
                            x.discount.kind === 'PERCENT'
                              ? `${x.discount.value / 100}%`
                              : money(x.discount.value),
                        })}`
                      : ''}
                    {x.instalments ? ` · ${a('instalments', { count: x.instalments })}` : ''}
                  </Text>
                </Stack>
                {canManage && !x.endsOn && (
                  <EndAssignmentLazy
                    assignment={{ id: x.id, version: x.version, studentName: x.studentName }}
                    today={today}
                    labels={labels.assignments}
                  />
                )}
              </Box>
            ))}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}
