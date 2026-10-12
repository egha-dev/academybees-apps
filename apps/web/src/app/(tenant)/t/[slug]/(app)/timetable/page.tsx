import {
  addDays,
  CourseListSchema,
  isoWeekday,
  localDate,
  type Session,
  SessionListSchema,
  TeacherPageSchema,
} from '@academybee/contracts';
import { formatDate, formatTime } from '@academybee/i18n';
import { StatusBadge } from '@academybee/ui/components/display';
import { PermissionState } from '@academybee/ui/components/feedback';
import { Box, Stack } from '@academybee/ui/components/layout';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMessages, getTranslations } from 'next-intl/server';

import { SessionSheetLazy } from '@/components/scheduling/timetable-lazy';
import { PageHeader } from '@/components/shell/page-header';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { apiServerGet } from '@/lib/api.server';
import { schedulingEnabled } from '@/lib/flags.server';
import { academyTimeZone, hostContext } from '@/lib/host-context.server';
import { homeFor } from '@/lib/session.server';
import { academyTerms, withWords, wordsOf } from '@/lib/terms.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('scheduling.timetable');
  return { title: t('metaTitle') };
}

type View = 'day' | 'week' | 'teacher';
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const STATUS_TONE = { SCHEDULED: 'info', CANCELLED: 'warning', COMPLETED: 'success' } as const;

/**
 * Timetable (UX §11.6, C-116): Day, Week and Teacher views of the real classes — cancellations,
 * moves, make-ups and holidays included. Server-rendered (no grid library); a class opens its
 * sheet (cancel, bring back, move, make-up) through `?session=`. Desktop columns, phone timeline.
 */
export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ me, academy }, enabled, params, { context }, terms, t, sched, shellT, messages] =
    await Promise.all([
      signedInMember(),
      schedulingEnabled(),
      searchParams,
      hostContext(),
      academyTerms(),
      getTranslations('scheduling.timetable'),
      getTranslations('scheduling'),
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
  const words = wordsOf(terms);
  const timeZone = academyTimeZone(context) ?? 'Asia/Kolkata';
  const today = localDate(new Date(), timeZone);
  const view: View = (['day', 'week', 'teacher'] as const).includes(one(params.view) as View)
    ? (one(params.view) as View)
    : 'week';
  const anchor = isDate(one(params.date)) ? one(params.date) : today;
  const from = view === 'day' ? anchor : addDays(anchor, 1 - isoWeekday(anchor));
  const to = view === 'day' ? anchor : addDays(from, 6);
  const courseId = isId(one(params.course)) ? one(params.course) : '';
  const teacherId = isId(one(params.teacher)) ? one(params.teacher) : '';
  const selected = isId(one(params.session)) ? one(params.session) : '';
  const query = new URLSearchParams({ from, to });
  if (courseId) query.set('courseId', courseId);
  if (teacherId) query.set('teacherId', teacherId);
  const [res, coursesRes, teachersRes] = await Promise.all([
    apiServerGet(`/sessions?${query.toString()}`),
    apiServerGet('/courses'),
    holds(me, 'teacher.read') ? apiServerGet('/teachers?limit=100') : Promise.resolve(undefined),
  ]);
  if (!res.ok) throw new Error(`sessions ${res.status}`);
  const list = SessionListSchema.parse(await res.json());
  const courses = coursesRes.ok ? CourseListSchema.parse(await coursesRes.json()).items : [];
  const teachers = teachersRes?.ok
    ? TeacherPageSchema.parse(await teachersRes.json()).items.filter((x) => x.status === 'ACTIVE')
    : [];
  const days = Array.from({ length: view === 'day' ? 1 : 7 }, (_, i) => addDays(from, i));
  const state = {
    view,
    date: anchor,
    ...(courseId ? { course: courseId } : {}),
    ...(teacherId ? { teacher: teacherId } : {}),
  };
  const href = (extra: Record<string, string>) =>
    `/timetable?${new URLSearchParams({ ...state, ...extra }).toString()}`;
  const step = view === 'day' ? 1 : 7;
  const time = (iso: string) => formatTime(iso, { timeZone });
  const holidayOn = (d: string) => list.holidays.find((h) => h.startDate <= d && h.endDate >= d);
  const session = list.items.find((s) => s.id === selected);

  const card = (s: Session) => (
    <Box
      component="a"
      key={s.id}
      href={href({ session: s.id })}
      aria-current={s.id === selected ? 'true' : undefined}
      sx={{
        display: 'block',
        padding: 1.5,
        border: '1px solid',
        borderColor: s.id === selected ? 'ab.accent' : 'ab.border',
        borderInlineStart: '4px solid',
        borderInlineStartColor: s.status === 'CANCELLED' ? 'ab.border' : 'ab.accent',
        borderRadius: 2,
        bgcolor: 'ab.surface',
        color: 'ab.textPrimary',
        '&:hover': { bgcolor: 'ab.surfaceRaised' },
      }}
    >
      <Text variant="meta" tone="secondary" as="span">
        {time(s.startsAt)}–{time(s.endsAt)}
      </Text>
      <Box sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{s.batchName}</Box>
      <Text variant="meta" tone="secondary" as="span">
        {s.teacherName ?? t('noTeacher', words)}
      </Text>
      {s.status !== 'SCHEDULED' && (
        <Box sx={{ marginBlockStart: 0.5 }}>
          <StatusBadge tone={STATUS_TONE[s.status]} label={sched(`session.status.${s.status}`)} />
        </Box>
      )}
    </Box>
  );
  const dayColumn = (d: string, sessions: Session[], heading = true) => {
    const holiday = holidayOn(d);
    return (
      <Stack key={d} spacing={1} sx={{ minInlineSize: 0 }}>
        {heading && (
          <Box
            sx={{
              fontWeight: 600,
              fontSize: 14,
              color: d === today ? 'ab.textPrimary' : 'ab.textSecondary',
              borderBlockEnd: d === today ? '3px solid' : '1px solid',
              borderColor: d === today ? 'ab.accent' : 'ab.border',
              paddingBlockEnd: 0.5,
            }}
          >
            {formatDate(d, { style: 'medium', timeZone })}
          </Box>
        )}
        {holiday && (
          <Box
            sx={{
              padding: 1,
              borderRadius: 1,
              bgcolor: 'ab.accentSoft',
              color: 'ab.onAccentSoft',
              fontSize: 14,
            }}
          >
            {t('holidayBand', { name: holiday.name })}
          </Box>
        )}
        {sessions.length === 0 ? (
          <Text variant="meta" tone="secondary">
            {t('emptyDay')}
          </Text>
        ) : (
          sessions.map(card)
        )}
      </Stack>
    );
  };
  const byDay = (d: string, sessions = list.items) => sessions.filter((s) => s.date === d);
  // One row per teacher who has classes in the range (names from the classes themselves).
  const teacherRows = [
    ...new Map(list.items.map((s) => [s.teacherId ?? '', s.teacherName ?? t('noTeacher', words)])),
  ]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => (a.id === '' ? 1 : b.id === '' ? -1 : a.name.localeCompare(b.name)));

  return (
    <Stack spacing={4}>
      <PageHeader
        title={t('title')}
        body={t('body', { academy })}
        action={
          holds(me, 'timetable.read') ? (
            <PlainButton variant="secondary" href="/timetable/holidays">
              {t('holidays')}
            </PlainButton>
          ) : undefined
        }
      />
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        sx={{ gap: 2, alignItems: { md: 'center' }, justifyContent: 'space-between' }}
      >
        <Box
          component="nav"
          aria-label={t('views.label')}
          sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}
        >
          {(['day', 'week', 'teacher'] as const).map((v) => (
            <PlainButton
              key={v}
              variant={v === view ? 'primary' : 'secondary'}
              href={href({ view: v })}
            >
              {t(`views.${v}`, words)}
            </PlainButton>
          ))}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <PlainButton variant="ghost" href={href({ date: addDays(anchor, -step) })}>
            {t('prev')}
          </PlainButton>
          <PlainButton variant="ghost" href={href({ date: today })}>
            {t('today')}
          </PlainButton>
          <PlainButton variant="ghost" href={href({ date: addDays(anchor, step) })}>
            {t('next')}
          </PlainButton>
          <Text as="span">
            {view === 'day'
              ? formatDate(from, { style: 'full', timeZone })
              : t('range', {
                  start: formatDate(from, { style: 'medium', timeZone }),
                  end: formatDate(to, { style: 'medium', timeZone }),
                })}
          </Text>
        </Box>
      </Stack>
      {(courses.length > 1 || teachers.length > 1) && (
        <Stack
          component="form"
          method="get"
          direction={{ xs: 'column', sm: 'row' }}
          sx={{ gap: 2, alignItems: { sm: 'flex-end' } }}
        >
          <input type="hidden" name="view" value={view} />
          <input type="hidden" name="date" value={anchor} />
          {courses.length > 1 && (
            <Filter
              id="tt-course"
              name="course"
              label={t('filterCourse', words)}
              value={courseId}
              all={t('all')}
              options={courses.map((c) => ({ value: c.id, label: c.name }))}
            />
          )}
          {teachers.length > 1 && (
            <Filter
              id="tt-teacher"
              name="teacher"
              label={t('filterTeacher', words)}
              value={teacherId}
              all={t('all')}
              options={teachers.map((x) => ({ value: x.id, label: x.fullName }))}
            />
          )}
          <PlainButton variant="secondary" type="submit">
            {t('apply')}
          </PlainButton>
        </Stack>
      )}

      {list.items.length === 0 && view !== 'week' ? (
        <Text tone="secondary">{t('empty')}</Text>
      ) : view === 'day' ? (
        dayColumn(from, byDay(from), false)
      ) : view === 'week' ? (
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', md: 'repeat(7, minmax(0, 1fr))' },
          }}
        >
          {days.map((d) => dayColumn(d, byDay(d)))}
        </Box>
      ) : (
        <Stack spacing={4}>
          {teacherRows.map((r) => (
            <Stack key={r.id || 'none'} spacing={1}>
              <Text variant="section" as="h2">
                {r.name}
              </Text>
              <Box
                sx={{
                  display: 'grid',
                  gap: 2,
                  gridTemplateColumns: { xs: '1fr', md: 'repeat(7, minmax(0, 1fr))' },
                }}
              >
                {days.map((d) =>
                  dayColumn(
                    d,
                    byDay(d).filter((s) => (s.teacherId ?? '') === r.id),
                  ),
                )}
              </Box>
            </Stack>
          ))}
        </Stack>
      )}
      {session && (
        <SessionSheetLazy
          session={session}
          now={new Date().toISOString()}
          closeHref={href({})}
          teachers={teachers.map((x) => ({ id: x.id, fullName: x.fullName }))}
          canManage={holds(me, 'session.manage')}
          dateLabel={formatDate(session.date, { style: 'full', timeZone })}
          timeLabel={`${time(session.startsAt)}–${time(session.endsAt)}`}
          labels={{
            sheet: withWords(messages.scheduling.sessionSheet, words),
            status: messages.scheduling.session.status,
            common: messages.people.form,
            errors: { ...messages.people.errors, offline: messages.people.form.offline },
          }}
        />
      )}
    </Stack>
  );
}

function Filter({
  id,
  name,
  label,
  value,
  all,
  options,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  all: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box component="label" htmlFor={id} sx={{ fontSize: 14, fontWeight: 600 }}>
        {label}
      </Box>
      <Box
        component="select"
        id={id}
        name={name}
        defaultValue={value}
        sx={{
          minBlockSize: 48,
          paddingInline: '12px',
          font: 'inherit',
          fontSize: 16,
          color: 'ab.textPrimary',
          bgcolor: 'ab.surface',
          border: '1px solid',
          borderColor: 'ab.borderStrong',
          borderRadius: 2,
        }}
      >
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Box>
    </Box>
  );
}
