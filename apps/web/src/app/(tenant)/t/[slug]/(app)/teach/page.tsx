import { addDays, BatchPageSchema, localDate, SessionListSchema } from '@academybee/contracts';
import { formatDate } from '@academybee/i18n';
import { Card } from '@academybee/ui/components/display';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { SessionList } from '@/components/scheduling/session-list.server';
import { PageHeader } from '@/components/shell/page-header';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { apiServerGet } from '@/lib/api.server';
import { schedulingEnabled } from '@/lib/flags.server';
import { academyTimeZone, hostContext } from '@/lib/host-context.server';
import { academyTerms } from '@/lib/terms.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('scheduling.teach');
  return { title: t('metaTitle') };
}

/**
 * Teacher home v1 (C-117, UX §25): today's and the next 7 days' classes and "My batches", read
 * only and limited to what this teacher teaches (ASSIGNED scope). Attendance comes with the
 * Teacher PWA in Phase 6; its button shows why it isn't there yet. Behind `p5-scheduling`.
 */
export default async function TeachPage() {
  const [{ me, academy }, enabled, { context }, terms, t, sched] = await Promise.all([
    signedInMember({ experience: 'teach' }),
    schedulingEnabled(),
    hostContext(),
    academyTerms(),
    getTranslations('scheduling.teach'),
    getTranslations('scheduling'),
  ]);
  const header = (
    <PageHeader title={t('title', { name: me.user.name })} body={t('body', { academy })} />
  );
  if (!enabled || !holds(me, 'timetable.read')) return header;
  const timeZone = academyTimeZone(context) ?? 'Asia/Kolkata';
  const today = localDate(new Date(), timeZone);
  const [sessionsRes, batchesRes] = await Promise.all([
    apiServerGet(`/sessions?from=${today}&to=${addDays(today, 7)}`),
    apiServerGet('/batches?limit=50'),
  ]);
  if (!sessionsRes.ok) throw new Error(`sessions ${sessionsRes.status}`);
  if (!batchesRes.ok) throw new Error(`batches ${batchesRes.status}`);
  const sessions = SessionListSchema.parse(await sessionsRes.json()).items;
  const batches = BatchPageSchema.parse(await batchesRes.json()).items;
  // The read-only Batch Workspace (C-117) is part of the same release flag.
  const enabledWorkspace = enabled;
  const todays = sessions.filter((s) => s.date === today);
  const later = sessions.filter((s) => s.date > today);
  const byDay = [...new Set(later.map((s) => s.date))];

  return (
    <Stack spacing={6}>
      {header}
      <Card title={t('todayTitle')}>
        {todays.length === 0 ? (
          <Text tone="secondary">{t('nothingToday')}</Text>
        ) : (
          <SessionList sessions={todays} timeZone={timeZone} terms={terms} />
        )}
        {todays.some((s) => s.status === 'SCHEDULED') && (
          <Stack spacing={1}>
            <Box
              component="button"
              type="button"
              disabled
              aria-describedby="attendance-soon"
              sx={{
                alignSelf: 'flex-start',
                minBlockSize: 48,
                paddingInline: 4,
                font: 'inherit',
                fontWeight: 600,
                border: '1px solid',
                borderColor: 'ab.border',
                borderRadius: 2,
                bgcolor: 'ab.surfaceRaised',
                color: 'ab.textSecondary',
                cursor: 'not-allowed',
              }}
            >
              {t('takeAttendance')}
            </Box>
            <Text id="attendance-soon" variant="meta" tone="secondary">
              {t('attendanceSoon')}
            </Text>
          </Stack>
        )}
      </Card>
      <Card title={t('weekTitle')}>
        {later.length === 0 ? (
          <Text tone="secondary">{t('nothingThisWeek')}</Text>
        ) : (
          <Stack spacing={4}>
            {byDay.map((d) => (
              <Stack key={d} spacing={2}>
                <Text variant="bodySmall">{formatDate(d, { style: 'full', timeZone })}</Text>
                <SessionList
                  sessions={later.filter((s) => s.date === d)}
                  timeZone={timeZone}
                  terms={terms}
                />
              </Stack>
            ))}
          </Stack>
        )}
      </Card>
      <Card title={t('batchesTitle', { term: terms.batch })}>
        {batches.length === 0 ? (
          <Text tone="secondary">{t('noBatchesBody', { term: terms.batch })}</Text>
        ) : (
          <Stack component="ul" spacing={2} sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {batches.map((b) => (
              <Box
                component="li"
                key={b.id}
                sx={{ padding: 3, border: '1px solid', borderColor: 'ab.border', borderRadius: 2 }}
              >
                {enabledWorkspace ? (
                  <Box
                    component="a"
                    href={`/batches/${b.id}`}
                    sx={{ fontWeight: 600, color: 'ab.textPrimary' }}
                  >
                    {b.name}
                  </Box>
                ) : (
                  <Text>{b.name}</Text>
                )}
                <Text variant="meta" tone="secondary">
                  {b.courseName} · {t('students', { count: b.enrolled })}
                  {b.weekdays.length > 0 &&
                    ` · ${new Intl.ListFormat(undefined, { style: 'short', type: 'unit' }).format(
                      b.weekdays.map((w) => sched(`weekdayShort.d${w}` as 'weekdayShort.d1')),
                    )}`}
                </Text>
              </Box>
            ))}
          </Stack>
        )}
      </Card>
    </Stack>
  );
}
