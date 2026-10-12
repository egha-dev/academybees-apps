import {
  ActivityPageSchema,
  BatchSchema,
  CourseSchema,
  localDate,
  RosterSchema,
  ScheduleSchema,
  TeacherPageSchema,
} from '@academybee/contracts';
import { formatDate } from '@academybee/i18n';
import { Card, StatusBadge } from '@academybee/ui/components/display';
import { EmptyState } from '@academybee/ui/components/feedback';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { getMessages, getTranslations } from 'next-intl/server';

import {
  BatchActionsLazy,
  EnrolmentActionsLazy,
  EnrolStudentLazy,
  PatternEditorLazy,
} from '@/components/scheduling/batches-lazy';
import { plural } from '@/components/scheduling/plural';
import { fill } from '@/lib/fill';
import { SessionList } from '@/components/scheduling/session-list.server';
import { PageHeader } from '@/components/shell/page-header';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { apiServerGet } from '@/lib/api.server';
import { academyTimeZone, hostContext } from '@/lib/host-context.server';
import { academyTerms, withWords, wordsOf } from '@/lib/terms.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const res = /^[0-9a-f-]{36}$/i.test(id) ? await apiServerGet(`/batches/${id}`) : undefined;
  return { title: res?.ok ? BatchSchema.parse(await res.json()).name : undefined };
}

const TABS = ['students', 'schedule', 'activity'] as const;
type Tab = (typeof TABS)[number];

/**
 * Batch Workspace (UX §10, §11.5): who meets when, who comes on which day (C-120), how full each
 * day is (C-121), the next classes and what changed. Primary actions: Attendance (Phase 6),
 * Students, Days and times. Read-only for teachers (C-117).
 */
export default async function BatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; edit?: string }>;
}) {
  const [{ me }, { id }, query, { context }, terms, t, sched, messages] = await Promise.all([
    signedInMember(),
    params,
    searchParams,
    hostContext(),
    academyTerms(),
    getTranslations('scheduling.batch'),
    getTranslations('scheduling'),
    getMessages(),
  ]);
  const words = wordsOf(terms);
  const res = /^[0-9a-f-]{36}$/i.test(id) ? await apiServerGet(`/batches/${id}`) : undefined;
  if (!res?.ok) {
    if (res && res.status !== 404) throw new Error(`batch ${res.status}`);
    return (
      <EmptyState
        title={t('notFound.title')}
        body={t('notFound.body')}
        action={{
          label: t('notFound.action'),
          href: me.academy.experiences.includes('manage') ? '/batches' : '/teach',
        }}
      />
    );
  }
  const batch = BatchSchema.parse(await res.json());
  const tab: Tab = TABS.includes(query.tab as Tab) ? (query.tab as Tab) : 'students';
  const timeZone = academyTimeZone(context) ?? 'Asia/Kolkata';
  const today = localDate(new Date(), timeZone);
  const canManage = holds(me, 'batch.manage');
  const canEnrol = holds(me, 'batch.enrol');
  const canSchedule = holds(me, 'timetable.manage');
  const weekday = (n: number) => sched(`weekday.d${n}` as 'weekday.d1');
  const short = (n: number) => sched(`weekdayShort.d${n}` as 'weekdayShort.d1');
  const list = (items: string[]) =>
    new Intl.ListFormat(undefined, { style: 'short', type: 'unit' }).format(items);
  const weekdayNames = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((n) => [`d${n}`, weekday(n)]));
  const common = messages.people.form;
  const errors = { ...messages.people.errors, offline: messages.people.form.offline };
  const [courseRes, teachersRes] = await Promise.all([
    canManage ? apiServerGet(`/courses/${batch.courseId}`) : Promise.resolve(undefined),
    canManage && holds(me, 'teacher.read')
      ? apiServerGet('/teachers?limit=100')
      : Promise.resolve(undefined),
  ]);
  const course = courseRes?.ok ? CourseSchema.parse(await courseRes.json()) : undefined;
  const teachers = teachersRes?.ok
    ? TeacherPageSchema.parse(await teachersRes.json()).items.filter((x) => x.status === 'ACTIVE')
    : [];
  const dates =
    batch.startsOn && batch.endsOn
      ? t('dates', { start: formatDate(batch.startsOn), end: formatDate(batch.endsOn) })
      : batch.startsOn
        ? t('from', { start: formatDate(batch.startsOn) })
        : batch.endsOn
          ? t('until', { end: formatDate(batch.endsOn) })
          : undefined;

  return (
    <Stack spacing={5}>
      <PageHeader
        title={batch.name}
        body={[
          batch.levelName ? `${batch.courseName} · ${batch.levelName}` : batch.courseName,
          batch.teachers.length
            ? batch.teachers.map((x) => x.fullName).join(', ')
            : sched('batches.noTeacher', words),
        ].join(' · ')}
      />
      <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        {batch.status === 'ARCHIVED' && <StatusBadge tone="neutral" label={t('archived')} />}
        <Text tone="secondary">
          {batch.capacity === null ? t('noCapacity') : t('capacity', { capacity: batch.capacity })}
          {dates ? ` · ${dates}` : ''}
        </Text>
      </Stack>
      {batch.dayLoad.length > 0 && (
        <Box
          component="ul"
          aria-label={sched('batches.title', words)}
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            margin: 0,
            padding: 0,
            listStyle: 'none',
          }}
        >
          {batch.dayLoad.map((d) => {
            const full = batch.capacity !== null && d.students >= batch.capacity;
            return (
              <li key={d.weekday}>
                <StatusBadge
                  tone={full ? 'warning' : 'neutral'}
                  label={
                    batch.capacity === null
                      ? t('load', { day: short(d.weekday), students: d.students })
                      : t('loadOf', {
                          day: short(d.weekday),
                          students: d.students,
                          capacity: batch.capacity,
                        })
                  }
                />
              </li>
            );
          })}
        </Box>
      )}
      <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Stack spacing={0.5}>
          <Box
            component="button"
            type="button"
            disabled
            aria-describedby="batch-attendance-soon"
            sx={{
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
          <Text id="batch-attendance-soon" variant="meta" tone="secondary">
            {t('attendanceSoon')}
          </Text>
        </Stack>
        {canManage && (
          <BatchActionsLazy
            batch={batch}
            course={course}
            teachers={teachers.map((x) => ({ id: x.id, fullName: x.fullName }))}
            labels={{ form: withWords(messages.scheduling.batchForm, words), common, errors }}
          />
        )}
      </Stack>
      <Box
        component="nav"
        aria-label={t('tabs.label')}
        sx={{ borderBlockEnd: '1px solid', borderColor: 'ab.border' }}
      >
        <Box
          component="ul"
          sx={{ display: 'flex', gap: 2, margin: 0, padding: 0, flexWrap: 'wrap' }}
        >
          {TABS.map((key) => (
            <Box component="li" key={key} sx={{ listStyle: 'none' }}>
              <Box
                component="a"
                href={`/batches/${batch.id}?tab=${key}`}
                aria-current={tab === key ? 'page' : undefined}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minBlockSize: 48,
                  paddingInline: 3,
                  textDecoration: 'none',
                  color: tab === key ? 'ab.textPrimary' : 'ab.textSecondary',
                  fontWeight: tab === key ? 600 : 500,
                  borderBlockEnd: '3px solid',
                  borderColor: tab === key ? 'ab.accent' : 'transparent',
                }}
              >
                {t(`tabs.${key}`)}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      {tab === 'students' && (
        <Roster
          batchId={batch.id}
          batchName={batch.name}
          today={today}
          canEnrol={canEnrol && batch.status === 'ACTIVE'}
          weekdayNames={weekdayNames}
          list={list}
          short={short}
          labels={{
            enrol: withWords(messages.scheduling.enrol, words),
            changeDays: messages.scheduling.changeDays,
            leave: messages.scheduling.leave,
            transfer: withWords(messages.scheduling.transfer, words),
            roster: withWords(messages.scheduling.batch.roster, words),
            weekday: weekdayNames,
            common,
            errors,
          }}
        />
      )}
      {tab === 'schedule' && (
        <ScheduleTab
          batchId={batch.id}
          batchName={batch.name}
          today={today}
          timeZone={timeZone}
          terms={terms}
          canSchedule={canSchedule && batch.status === 'ACTIVE'}
          startOpen={query.edit === '1'}
          weekday={weekday}
          list={list}
          short={short}
          editorLabels={{
            pattern: messages.scheduling.pattern,
            weekday: weekdayNames,
            cancel: common.cancel,
            close: common.close,
            errors,
          }}
        />
      )}
      {tab === 'activity' && <ActivityTab batchId={batch.id} timeZone={timeZone} />}
    </Stack>
  );
}

async function Roster({
  batchId,
  batchName,
  today,
  canEnrol,
  list,
  short,
  labels,
}: {
  batchId: string;
  batchName: string;
  today: string;
  canEnrol: boolean;
  weekdayNames: Record<string, string>;
  list: (items: string[]) => string;
  short: (n: number) => string;
  labels: Parameters<typeof EnrolStudentLazy>[0]['labels'];
}) {
  const res = await apiServerGet(`/batches/${batchId}/students`);
  if (!res.ok) throw new Error(`roster ${res.status}`);
  const roster = RosterSchema.parse(await res.json());
  const r = labels.roster;
  return (
    <Stack spacing={3}>
      {canEnrol && (
        <Box>
          <EnrolStudentLazy
            batchId={batchId}
            batchName={batchName}
            batchWeekdays={roster.batchWeekdays}
            today={today}
            labels={labels}
          />
        </Box>
      )}
      {roster.items.length === 0 ? (
        <Text tone="secondary">{r.empty}</Text>
      ) : (
        <Box
          component="ul"
          sx={{ margin: 0, padding: 0, borderBlockStart: '1px solid', borderColor: 'ab.border' }}
        >
          {roster.items.map((e) => (
            <Box
              component="li"
              key={e.id}
              sx={{
                listStyle: 'none',
                borderBlockEnd: '1px solid',
                borderColor: 'ab.border',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 2,
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBlock: 2,
                paddingInline: 1,
              }}
            >
              <Stack spacing={0.5} sx={{ minInlineSize: 0, flex: '1 1 220px' }}>
                <Box
                  component="a"
                  href={`/students/${e.studentId}`}
                  sx={{ fontWeight: 600, color: 'ab.textPrimary' }}
                >
                  {e.studentName}
                </Box>
                <Text variant="meta" tone="secondary">
                  {e.admissionNo} · {e.weekdays.length ? list(e.weekdays.map(short)) : r.everyDay} ·{' '}
                  {plural(r.perWeek, e.classesPerWeek)} ·{' '}
                  {fill(r.since, { date: formatDate(e.startedOn) })}
                </Text>
              </Stack>
              {canEnrol && (
                <EnrolmentActionsLazy
                  enrolment={e}
                  batchId={batchId}
                  batchName={batchName}
                  batchWeekdays={roster.batchWeekdays}
                  today={today}
                  labels={labels}
                />
              )}
            </Box>
          ))}
        </Box>
      )}
    </Stack>
  );
}

async function ScheduleTab({
  batchId,
  batchName,
  today,
  timeZone,
  terms,
  canSchedule,
  startOpen,
  weekday,
  list,
  short,
  editorLabels,
}: {
  batchId: string;
  batchName: string;
  today: string;
  timeZone: string;
  terms: Awaited<ReturnType<typeof academyTerms>>;
  canSchedule: boolean;
  startOpen: boolean;
  weekday: (n: number) => string;
  list: (items: string[]) => string;
  short: (n: number) => string;
  editorLabels: Omit<Parameters<typeof PatternEditorLazy>[0]['labels'], 'open'>;
}) {
  const [res, t] = await Promise.all([
    apiServerGet(`/batches/${batchId}/schedule`),
    getTranslations('scheduling.batch.schedule'),
  ]);
  if (!res.ok) throw new Error(`schedule ${res.status}`);
  const schedule = ScheduleSchema.parse(await res.json());
  return (
    <Stack spacing={4}>
      <Card title={t('title')}>
        {schedule.slots.length === 0 ? (
          <Text tone="secondary">{t('empty')}</Text>
        ) : (
          <Stack component="ul" spacing={1} sx={{ margin: 0, paddingInlineStart: 4 }}>
            {schedule.slots.map((s) => (
              <li key={s.id}>
                <Text>
                  {t('slot', { day: weekday(s.weekday), start: s.start, end: s.end })}
                  {s.teacherName ? ` · ${s.teacherName}` : ''}
                </Text>
              </li>
            ))}
          </Stack>
        )}
        {schedule.slots.length > 0 && (
          <Text tone="secondary">{t('perWeek', { count: schedule.slots.length })}</Text>
        )}
        {canSchedule && (
          <Box>
            <PatternEditorLazy
              batchId={batchId}
              batchName={batchName}
              slots={schedule.slots}
              today={today}
              startOpen={startOpen}
              labels={{ ...editorLabels, open: schedule.slots.length ? t('edit') : t('set') }}
            />
          </Box>
        )}
      </Card>
      {schedule.plansOutside.length > 0 && (
        <Card title={t('plansOutside')}>
          <Stack component="ul" spacing={1} sx={{ margin: 0, paddingInlineStart: 4 }}>
            {schedule.plansOutside.map((p) => (
              <li key={p.enrolmentId}>
                <Text>
                  {t('planOutside', { name: p.studentName, days: list(p.weekdays.map(short)) })}
                </Text>
              </li>
            ))}
          </Stack>
        </Card>
      )}
      {schedule.doubleBookings.length > 0 && (
        <Card title={t('doubleBookings', { teacher: terms.teacher })}>
          <Stack component="ul" spacing={1} sx={{ margin: 0, paddingInlineStart: 4 }}>
            {schedule.doubleBookings.map((d) => (
              <li key={`${d.sessionId}-${d.otherBatchName}-${d.date}`}>
                <Text>
                  {t('doubleBooking', {
                    teacher: d.teacherName,
                    other: d.otherBatchName,
                    date: formatDate(d.date),
                    start: d.start,
                    end: d.end,
                  })}
                </Text>
              </li>
            ))}
          </Stack>
        </Card>
      )}
      <Card title={t('upcoming')}>
        {schedule.upcoming.length === 0 ? (
          <Text tone="secondary">{t('noUpcoming')}</Text>
        ) : (
          <Stack spacing={3}>
            {[...new Set(schedule.upcoming.map((s) => s.date))].map((d) => (
              <Stack key={d} spacing={1}>
                <Text variant="bodySmall">{formatDate(d, { style: 'full', timeZone })}</Text>
                <SessionList
                  sessions={schedule.upcoming.filter((s) => s.date === d)}
                  timeZone={timeZone}
                  terms={terms}
                  showBatch={false}
                />
              </Stack>
            ))}
          </Stack>
        )}
      </Card>
    </Stack>
  );
}

async function ActivityTab({ batchId, timeZone }: { batchId: string; timeZone: string }) {
  const [res, t] = await Promise.all([
    apiServerGet(`/batches/${batchId}/activity?limit=50`),
    getTranslations('scheduling.batch.activity'),
  ]);
  if (!res.ok) throw new Error(`activity ${res.status}`);
  const page = ActivityPageSchema.parse(await res.json());
  if (page.items.length === 0) return <Text tone="secondary">{t('empty')}</Text>;
  return (
    <Stack component="ul" spacing={2} sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {page.items.map((e) => (
        <li key={e.id}>
          <Text>{t(`type.${e.type.replace('.', '_')}` as 'type.batch_created')}</Text>
          <Text variant="meta" tone="secondary">
            {formatDate(e.at, { style: 'medium', timeZone })}
            {e.actorName ? ` · ${t('by', { name: e.actorName })}` : ''}
          </Text>
        </li>
      ))}
    </Stack>
  );
}
