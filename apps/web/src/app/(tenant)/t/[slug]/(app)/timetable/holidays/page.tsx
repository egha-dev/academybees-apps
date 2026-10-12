import { addDays, HolidayListSchema, localDate } from '@academybee/contracts';
import { formatDate } from '@academybee/i18n';
import { StatusBadge } from '@academybee/ui/components/display';
import { EmptyState, PermissionState } from '@academybee/ui/components/feedback';
import { Box, Stack } from '@academybee/ui/components/layout';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMessages, getTranslations } from 'next-intl/server';

import { AddHolidayLazy, RemoveHolidayLazy } from '@/components/scheduling/timetable-lazy';
import { PageHeader } from '@/components/shell/page-header';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { apiServerGet } from '@/lib/api.server';
import { schedulingEnabled } from '@/lib/flags.server';
import { academyTimeZone, hostContext } from '@/lib/host-context.server';
import { homeFor } from '@/lib/session.server';
import { academyTerms, withWords, wordsOf } from '@/lib/terms.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('scheduling.holidays');
  return { title: t('metaTitle') };
}

/**
 * Holidays and closures (G-03, C-115): upcoming and recent ones with how many classes each
 * cancelled. Adding one previews exactly what it cancels before anything changes; removing a
 * future one brings its classes back.
 */
export default async function HolidaysPage() {
  const [{ me, academy }, enabled, { context }, terms, t, shellT, messages] = await Promise.all([
    signedInMember(),
    schedulingEnabled(),
    hostContext(),
    academyTerms(),
    getTranslations('scheduling.holidays'),
    getTranslations('shell.permission'),
    getMessages(),
  ]);
  if (!enabled) notFound();
  if (!holds(me, 'timetable.read'))
    return (
      <PermissionState
        title={t('permission.title')}
        body={t('permission.body', { academy })}
        action={{ label: shellT('action'), href: homeFor(me) }}
      />
    );
  const timeZone = academyTimeZone(context) ?? 'Asia/Kolkata';
  const today = localDate(new Date(), timeZone);
  const res = await apiServerGet(`/holidays?from=${addDays(today, -90)}`);
  if (!res.ok) throw new Error(`holidays ${res.status}`);
  const { items } = HolidayListSchema.parse(await res.json());
  const upcoming = items.filter((h) => h.endDate >= today);
  const past = items.filter((h) => h.endDate < today).reverse();
  const canManage = holds(me, 'timetable.manage');
  const labels = {
    holidays: withWords(messages.scheduling.holidays, wordsOf(terms)),
    common: messages.people.form,
    errors: { ...messages.people.errors, offline: messages.people.form.offline },
  };
  const date = (d: string) => formatDate(d, { style: 'medium', timeZone });

  const list = (rows: typeof items) => (
    <Stack component="ul" spacing={2} sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {rows.map((h) => (
        <Box
          component="li"
          key={h.id}
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
            alignItems: 'center',
            padding: 3,
            border: '1px solid',
            borderColor: 'ab.border',
            borderRadius: 2,
            bgcolor: 'ab.surface',
          }}
        >
          <Stack spacing={0.5} sx={{ flex: '1 1 220px', minInlineSize: 0 }}>
            <Box sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{h.name}</Box>
            <Text variant="meta" tone="secondary">
              {h.startDate === h.endDate
                ? date(h.startDate)
                : t('dates', { start: date(h.startDate), end: date(h.endDate) })}
            </Text>
            <Text variant="meta" tone="secondary">
              {t('cancelledCount', { count: h.cancelledSessions })}
            </Text>
          </Stack>
          <StatusBadge tone="info" label={t(`kinds.${h.kind}`)} />
          {canManage && h.endDate >= today && (
            <RemoveHolidayLazy id={h.id} name={h.name} labels={labels} />
          )}
        </Box>
      ))}
    </Stack>
  );

  return (
    <Stack spacing={4}>
      <PageHeader
        title={t('title')}
        body={t('body', { academy })}
        action={canManage ? <AddHolidayLazy today={today} labels={labels} /> : undefined}
      />
      <Box>
        <PlainButton variant="ghost" href="/timetable">
          {messages.scheduling.timetable.title}
        </PlainButton>
      </Box>
      {items.length === 0 ? (
        <EmptyState title={t('empty')} body={t('body', { academy })} />
      ) : (
        <>
          <Stack spacing={2} component="section" aria-labelledby="hol-upcoming">
            <Text variant="section" as="h2" id="hol-upcoming">
              {t('upcoming')}
            </Text>
            {upcoming.length ? list(upcoming) : <Text tone="secondary">{t('empty')}</Text>}
          </Stack>
          {past.length > 0 && (
            <Stack spacing={2} component="section" aria-labelledby="hol-past">
              <Text variant="section" as="h2" id="hol-past">
                {t('past')}
              </Text>
              {list(past)}
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}
