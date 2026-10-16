import { AttendanceOverviewSchema, TodaySchema } from '@academybee/contracts';
import { formatDate } from '@academybee/i18n';
import { Card } from '@academybee/ui/components/display';
import { EmptyState } from '@academybee/ui/components/feedback';
import { Box, Stack } from '@academybee/ui/components/layout';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { SessionList } from '@/components/scheduling/session-list.server';
import { PageHeader } from '@/components/shell/page-header';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { apiServerGet } from '@/lib/api.server';
import { teacherPwaEnabled } from '@/lib/flags.server';
import { academyTimeZone, hostContext } from '@/lib/host-context.server';
import { academyTerms } from '@/lib/terms.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('scheduling.today');
  return { title: t('metaTitle') };
}

/**
 * Owner Today v1 (UX §10, §11.1): where am I (the academy's day), what needs attention, today's
 * classes, what happened recently. Finance and growth join in Phases 7–8. Roles without the timetable
 * see the plain welcome.
 */
export default async function TodayPage() {
  const [{ me, academy }, { context }, terms, t, sched] = await Promise.all([
    signedInMember({ experience: 'manage' }),
    hostContext(),
    academyTerms(),
    getTranslations('scheduling.today'),
    getTranslations('scheduling'),
  ]);
  const timeZone = academyTimeZone(context);
  const welcome = t('welcome', { name: me.user.name });
  if (!holds(me, 'timetable.read'))
    return <PageHeader title={t('title', { academy })} body={welcome} />;
  // Phase 6 (flag p6-teacher-pwa, G-16): today's roll calls and the ones not taken.
  const attendanceOn = (await teacherPwaEnabled()) && holds(me, 'attendance.read');
  const [res, overviewRes, staffT] = await Promise.all([
    apiServerGet('/today'),
    attendanceOn ? apiServerGet('/attendance/overview') : Promise.resolve(undefined),
    getTranslations('teach.staff'),
  ]);
  if (!res.ok) throw new Error(`today ${res.status}`);
  const today = TodaySchema.parse(await res.json());
  const overview = overviewRes?.ok
    ? AttendanceOverviewSchema.parse(await overviewRes.json())
    : undefined;
  const canMark = holds(me, 'attendance.mark');
  const date = formatDate(today.date, { style: 'full', ...(timeZone ? { timeZone } : {}) });
  const dates = (start: string, end: string) =>
    start === end
      ? formatDate(start, { style: 'medium' })
      : t('holidayDates', {
          start: formatDate(start, { style: 'medium' }),
          end: formatDate(end, { style: 'medium' }),
        });
  const { attention } = today;
  const items = [
    ...(overview?.sessions ?? [])
      .filter((s) => s.state === 'due')
      .map((s) => ({
        key: `a-${s.sessionId}`,
        href: canMark ? `/attendance/take?session=${s.sessionId}` : '/attendance',
        text: staffT('notTaken', { batch: s.batchName, start: s.start }),
      })),
    ...attention.batchesWithoutTeacher.map((b) => ({
      key: `t-${b.id}`,
      href: `/batches/${b.id}`,
      text: t('withoutTeacher', { name: b.name, term: terms.teacher }),
    })),
    ...attention.batchesFull.map((b) => ({
      key: `f-${b.id}`,
      href: `/batches/${b.id}?tab=students`,
      text: t('full', {
        name: b.name,
        day: sched(`weekday.d${b.weekday}` as 'weekday.d1'),
        students: b.students,
        capacity: b.capacity,
      }),
    })),
    ...(attention.sessionsWithoutTeacher > 0
      ? [
          {
            key: 'swt',
            text: t('sessionsWithoutTeacher', { count: attention.sessionsWithoutTeacher }),
          },
        ]
      : []),
    ...attention.upcomingHolidays.map((h) => ({
      key: `h-${h.id}`,
      text: t('upcomingHoliday', { name: h.name, dates: dates(h.startDate, h.endDate) }),
    })),
  ];

  return (
    <Stack spacing={6}>
      <PageHeader title={t('title', { academy })} body={t('body', { date })} />
      <Text tone="secondary">
        {welcome}{' '}
        {t('counts', {
          students: today.counts.students,
          batches: today.counts.batches,
          term: terms.batch,
        })}
      </Text>
      {today.counts.batches === 0 ? (
        <EmptyState
          title={t('noBatchesTitle', { term: terms.batch })}
          body={t('noBatchesBody', { term: terms.batch })}
          {...(holds(me, 'batch.manage')
            ? {
                action: {
                  label: sched('batches.add', { term: terms.batch }),
                  href: '/batches?add=1',
                },
              }
            : {})}
        />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 4,
            gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 2fr) minmax(0, 1fr)' },
            alignItems: 'start',
          }}
        >
          <Card title={t('classesTitle', { term: terms.batch })}>
            {today.holiday && <Text>{t('holidayToday', { name: today.holiday.name })}</Text>}
            {today.sessions.length === 0 ? (
              <Text tone="secondary">{t('classesEmpty')}</Text>
            ) : (
              <SessionList sessions={today.sessions} timeZone={timeZone} terms={terms} />
            )}
          </Card>
          <Stack spacing={4}>
            {overview && overview.sessions.length > 0 && (
              <Card title={staffT('todayTitle')}>
                <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
                  <Text>
                    {staffT('todayTotals', {
                      taken: overview.totals.taken,
                      total: overview.totals.taken + overview.totals.due + overview.totals.later,
                    })}
                  </Text>
                  <PlainButton variant="secondary" href="/attendance">
                    {staffT('title')}
                  </PlainButton>
                </Stack>
              </Card>
            )}
            <Card title={t('attentionTitle')}>
              {items.length === 0 ? (
                <Text tone="secondary">{t('allClear')}</Text>
              ) : (
                <Stack component="ul" spacing={1.5} sx={{ margin: 0, paddingInlineStart: 4 }}>
                  {items.map((i) => (
                    <li key={i.key}>
                      {'href' in i && i.href ? (
                        <Box component="a" href={i.href} sx={{ color: 'ab.textPrimary' }}>
                          {i.text}
                        </Box>
                      ) : (
                        <Text>{i.text}</Text>
                      )}
                    </li>
                  ))}
                </Stack>
              )}
            </Card>
            {today.recent.length > 0 && (
              <Card title={t('recentTitle')}>
                <Stack
                  component="ul"
                  spacing={1.5}
                  sx={{ margin: 0, padding: 0, listStyle: 'none' }}
                >
                  {today.recent.map((r) => (
                    <li key={r.id}>
                      <Text>
                        {t(`recent.${r.type.replace('.', '_')}` as 'recent.batch_created', {
                          name: r.batchName,
                        })}
                      </Text>
                      <Text variant="meta" tone="secondary">
                        {formatDate(r.at, { style: 'medium', ...(timeZone ? { timeZone } : {}) })}
                        {r.actorName ? ` · ${t('by', { name: r.actorName })}` : ''}
                      </Text>
                    </li>
                  ))}
                </Stack>
              </Card>
            )}
          </Stack>
        </Box>
      )}
    </Stack>
  );
}
