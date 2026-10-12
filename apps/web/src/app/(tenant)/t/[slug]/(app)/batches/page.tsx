import { BatchPageSchema, CourseListSchema, TeacherPageSchema } from '@academybee/contracts';
import { formatDate, formatTime } from '@academybee/i18n';
import { StatusBadge } from '@academybee/ui/components/display';
import { EmptyState, PermissionState } from '@academybee/ui/components/feedback';
import { Box, Stack } from '@academybee/ui/components/layout';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { getMessages, getTranslations } from 'next-intl/server';

import { AddBatchLazy } from '@/components/scheduling/batches-lazy';
import { PageHeader } from '@/components/shell/page-header';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { apiServerGet } from '@/lib/api.server';
import { academyTimeZone, hostContext } from '@/lib/host-context.server';
import { homeFor } from '@/lib/session.server';
import { academyTerms, withWords } from '@/lib/terms.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const [t, terms] = await Promise.all([getTranslations('scheduling.batches'), academyTerms()]);
  return { title: t('metaTitle', { term: terms.batch }) };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * Batches (UX §8 RUN, §11.5): who meets when, how full each day is (C-121) and the next class.
 * Server-rendered with a plain GET search; Add loads on use. Labels in the academy's words.
 */
export default async function BatchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ me, academy }, params, { context }, terms, t, sched, shellT, messages] =
    await Promise.all([
      signedInMember({ experience: 'manage' }),
      searchParams,
      hostContext(),
      academyTerms(),
      getTranslations('scheduling.batches'),
      getTranslations('scheduling'),
      getTranslations('shell.permission'),
      getMessages(),
    ]);
  const words = { term: terms.batch, course: terms.course, teacher: terms.teacher };
  if (!holds(me, 'batch.read'))
    return (
      <PermissionState
        title={t('permission.title', words)}
        body={t('permission.body', { academy })}
        action={{ label: shellT('action'), href: homeFor(me) }}
      />
    );
  const timeZone = academyTimeZone(context);
  const q = one(params.q).trim().slice(0, 60);
  const status = one(params.status) === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE';
  const courseId = /^[0-9a-f-]{36}$/i.test(one(params.course)) ? one(params.course) : '';
  const cursor = one(params.cursor);
  const query = new URLSearchParams({ limit: '50', status });
  if (q.length >= 2) query.set('q', q);
  if (courseId) query.set('courseId', courseId);
  if (cursor) query.set('cursor', cursor);
  const canManage = holds(me, 'batch.manage');
  const adding = canManage && one(params.add) === '1';
  const [res, coursesRes, teachersRes] = await Promise.all([
    apiServerGet(`/batches?${query.toString()}`),
    apiServerGet('/courses'),
    adding && holds(me, 'teacher.read')
      ? apiServerGet('/teachers?limit=100')
      : Promise.resolve(undefined),
  ]);
  if (!res.ok) throw new Error(`batches ${res.status}`);
  const page = BatchPageSchema.parse(await res.json());
  const courses = coursesRes.ok ? CourseListSchema.parse(await coursesRes.json()).items : [];
  const teachers = teachersRes?.ok ? TeacherPageSchema.parse(await teachersRes.json()).items : [];
  const day = (n: number) => sched(`weekdayShort.d${n}` as 'weekdayShort.d1');
  const days = (list: number[]) =>
    new Intl.ListFormat(undefined, { style: 'short', type: 'unit' }).format(list.map(day));
  const when = (iso: string) =>
    `${formatDate(iso, { style: 'medium', ...(timeZone ? { timeZone } : {}) })}, ${formatTime(iso, { ...(timeZone ? { timeZone } : {}) })}`;
  const link = (extra: Record<string, string>) =>
    `/batches?${new URLSearchParams({ ...(q ? { q } : {}), ...(courseId ? { course: courseId } : {}), status, ...extra }).toString()}`;

  return (
    <Stack spacing={6}>
      <PageHeader
        title={t('title', words)}
        body={t('body', { academy, ...words })}
        action={
          canManage ? (
            <PlainButton variant="primary" href="?add=1">
              {t('add', words)}
            </PlainButton>
          ) : undefined
        }
      />
      <Stack
        component="form"
        method="get"
        role="search"
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ gap: 2, alignItems: { sm: 'flex-end' } }}
      >
        <input type="hidden" name="status" value={status} />
        <Box sx={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box component="label" htmlFor="batch-search" sx={{ fontSize: 14, fontWeight: 600 }}>
            {t('search')}
          </Box>
          <Box
            component="input"
            id="batch-search"
            name="q"
            type="search"
            defaultValue={q}
            sx={FIELD}
          />
        </Box>
        {courses.length > 1 && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box component="label" htmlFor="batch-course" sx={{ fontSize: 14, fontWeight: 600 }}>
              {t('filterCourse', words)}
            </Box>
            <Box
              component="select"
              id="batch-course"
              name="course"
              defaultValue={courseId}
              sx={FIELD}
            >
              <option value="">{t('allCourses')}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Box>
          </Box>
        )}
        <Box component="button" type="submit" sx={{ ...FIELD, fontWeight: 600, cursor: 'pointer' }}>
          {t('searchSubmit')}
        </Box>
      </Stack>
      <Box component="nav" aria-label={t('tabs.label')} sx={{ display: 'flex', gap: 1 }}>
        {(['ACTIVE', 'ARCHIVED'] as const).map((s) => (
          <PlainButton
            key={s}
            variant={s === status ? 'primary' : 'secondary'}
            href={`/batches?status=${s}`}
          >
            {t(`tabs.${s}`)}
          </PlainButton>
        ))}
      </Box>

      {page.items.length === 0 ? (
        status === 'ARCHIVED' ? (
          <EmptyState title={t('archivedEmptyTitle')} body={t('archivedEmptyBody', words)} />
        ) : q || courseId ? (
          <EmptyState
            title={t('noResultsTitle')}
            body={t('noResultsBody')}
            action={{ label: t('clear'), href: '/batches' }}
          />
        ) : (
          <EmptyState
            title={t('emptyTitle', words)}
            body={t('emptyBody')}
            {...(canManage ? { action: { label: t('add', words), href: '?add=1' } } : {})}
          />
        )
      ) : (
        <Box
          component="ul"
          sx={{ margin: 0, padding: 0, borderBlockStart: '1px solid', borderColor: 'ab.border' }}
        >
          {page.items.map((b) => (
            <Box
              component="li"
              key={b.id}
              sx={{ listStyle: 'none', borderBlockEnd: '1px solid', borderColor: 'ab.border' }}
            >
              <Box
                component="a"
                href={`/batches/${b.id}`}
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 2,
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  minBlockSize: 72,
                  paddingInline: 2,
                  paddingBlock: 2,
                  color: 'inherit',
                  textDecoration: 'none',
                  '&:hover': { bgcolor: 'ab.surfaceRaised' },
                }}
              >
                <Stack spacing={0.5} sx={{ minInlineSize: 0, flex: '1 1 260px' }}>
                  <Text as="span">
                    <strong>{b.name}</strong>
                  </Text>
                  <Text variant="meta" tone="secondary" as="span">
                    {[
                      b.levelName ? `${b.courseName} · ${b.levelName}` : b.courseName,
                      b.teachers.length
                        ? b.teachers.map((x) => x.fullName).join(', ')
                        : t('noTeacher', words),
                    ].join(' · ')}
                  </Text>
                  <Text variant="meta" tone="secondary" as="span">
                    {b.weekdays.length ? days(b.weekdays) : t('noDays')}
                    {b.nextSessionAt ? ` · ${t('nextClass', { when: when(b.nextSessionAt) })}` : ''}
                  </Text>
                </Stack>
                <Stack spacing={0.5} sx={{ alignItems: 'flex-end' }}>
                  <Text as="span">{t('students', { count: b.enrolled })}</Text>
                  {b.fullestDay && b.fullestDay.students > 0 && (
                    <StatusBadge
                      tone={
                        b.capacity !== null && b.fullestDay.students >= b.capacity
                          ? 'warning'
                          : 'neutral'
                      }
                      label={
                        b.capacity !== null
                          ? t('fullest', {
                              day: day(b.fullestDay.weekday),
                              students: b.fullestDay.students,
                              capacity: b.capacity,
                            })
                          : t('fullestNoLimit', {
                              day: day(b.fullestDay.weekday),
                              students: b.fullestDay.students,
                            })
                      }
                    />
                  )}
                </Stack>
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {page.nextCursor && (
        <Box
          component="a"
          href={link({ cursor: page.nextCursor })}
          sx={{ fontWeight: 600, color: 'ab.textPrimary' }}
        >
          {t('loadMore')}
        </Box>
      )}
      {adding && (
        <AddBatchLazy
          courses={courses}
          teachers={teachers
            .filter((x) => x.status === 'ACTIVE')
            .map((x) => ({ id: x.id, fullName: x.fullName }))}
          labels={{
            form: withWords(messages.scheduling.batchForm, words),
            common: messages.people.form,
            errors: { ...messages.people.errors, offline: messages.people.form.offline },
          }}
        />
      )}
    </Stack>
  );
}

const FIELD = {
  minBlockSize: 48,
  paddingInline: '14px',
  font: 'inherit',
  fontSize: 16,
  color: 'ab.textPrimary',
  bgcolor: 'ab.surface',
  border: '1px solid',
  borderColor: 'ab.borderStrong',
  borderRadius: 2,
} as const;
