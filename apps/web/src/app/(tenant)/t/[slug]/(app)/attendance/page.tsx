import { addDays, AttendanceOverviewSchema, localDate } from '@academybee/contracts';
import { formatDate } from '@academybee/i18n';
import { PermissionState } from '@academybee/ui/components/feedback';
import { Box, Stack } from '@academybee/ui/components/layout';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { SessionRows } from '@/components/attendance/session-rows.server';
import { PageHeader } from '@/components/shell/page-header';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { apiServerGet } from '@/lib/api.server';
import { teacherPwaEnabled } from '@/lib/flags.server';
import { academyTimeZone, hostContext } from '@/lib/host-context.server';
import { homeFor } from '@/lib/session.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('teach.staff');
  return { title: t('metaTitle') };
}

const isDate = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Attendance overview (Phase 6, G-16): one academy day's classes with their roll call — taken,
 * not taken after the class ended, later, cancelled — and Take / Edit for staff who mark.
 */
export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const [{ me, academy }, enabled, params, { context }, t, shellT] = await Promise.all([
    signedInMember({ experience: 'manage' }),
    teacherPwaEnabled(),
    searchParams,
    hostContext(),
    getTranslations('teach.staff'),
    getTranslations('shell.permission'),
  ]);
  if (!enabled) notFound();
  if (!holds(me, 'attendance.read'))
    return (
      <PermissionState
        title={t('permission.title')}
        body={t('permission.body', { academy })}
        action={{ label: shellT('action'), href: homeFor(me) }}
      />
    );
  const timeZone = academyTimeZone(context) ?? 'Asia/Kolkata';
  const today = localDate(new Date(), timeZone);
  const date = isDate(params.date) ? params.date : today;
  const res = await apiServerGet(`/attendance/overview?date=${date}`);
  if (!res.ok) throw new Error(`attendance overview ${res.status}`);
  const overview = AttendanceOverviewSchema.parse(await res.json());
  // A device keeps the last 7 days (C-124): older roll calls are shown, not edited, for now.
  const markable = holds(me, 'attendance.mark') && date >= addDays(today, -7) && date <= today;
  return (
    <Stack spacing={4}>
      <PageHeader
        title={t('title')}
        body={t('body', { date: formatDate(date, { style: 'full', timeZone }), academy })}
      />
      <Box
        component="nav"
        aria-label={t('date')}
        sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <PlainButton variant="ghost" href={`/attendance?date=${addDays(date, -1)}`}>
          {t('prev')}
        </PlainButton>
        <PlainButton variant="ghost" href="/attendance">
          {t('today')}
        </PlainButton>
        {date < today && (
          <PlainButton variant="ghost" href={`/attendance?date=${addDays(date, 1)}`}>
            {t('next')}
          </PlainButton>
        )}
      </Box>
      {overview.sessions.length === 0 ? (
        <Text tone="secondary">{t('empty')}</Text>
      ) : (
        <>
          <Text>{t('totals', overview.totals)}</Text>
          <SessionRows
            rows={overview.sessions.map((s) => ({
              sessionId: s.sessionId,
              title: s.batchName,
              when: `${s.start}–${s.end}`,
              state: s.state,
              counts: s.counts,
              markable,
            }))}
          />
          {!markable && holds(me, 'attendance.mark') && date < addDays(today, -7) && (
            <Text variant="meta" tone="secondary">
              {t('olderNote')}
            </Text>
          )}
        </>
      )}
    </Stack>
  );
}
