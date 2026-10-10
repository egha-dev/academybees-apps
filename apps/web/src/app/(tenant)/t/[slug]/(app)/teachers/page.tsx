import { LinkableMemberListSchema, TeacherPageSchema } from '@academybee/contracts';
import { StatusBadge } from '@academybee/ui/components/display';
import { EmptyState, PermissionState } from '@academybee/ui/components/feedback';
import { Box, Stack } from '@academybee/ui/components/layout';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMessages, getTranslations } from 'next-intl/server';

import { AddTeacherLazy } from '@/components/people/teachers-lazy';
import { PageHeader } from '@/components/shell/page-header';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { apiServerGet } from '@/lib/api.server';
import { peopleEnabled } from '@/lib/flags.server';
import { homeFor } from '@/lib/session.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('people.teachers');
  return { title: t('metaTitle') };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const ACCESS_TONE = { MEMBER: 'success', INVITED: 'info', NONE: 'neutral' } as const;

/**
 * Teachers (UX §11): who teaches here and how they sign in. Teams are small, so the list is
 * server-rendered with a plain GET search (no list JS); Add Teacher loads on use.
 */
export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ me, academy }, enabled, params, t, shellT, messages] = await Promise.all([
    signedInMember({ experience: 'manage' }),
    peopleEnabled(),
    searchParams,
    getTranslations('people.teachers'),
    getTranslations('shell.permission'),
    getMessages(),
  ]);
  if (!enabled) notFound();
  if (!holds(me, 'teacher.read'))
    return (
      <PermissionState
        title={t('permission.title')}
        body={t('permission.body', { academy })}
        action={{ label: shellT('action'), href: homeFor(me) }}
      />
    );
  const q = one(params.q).trim().slice(0, 60);
  const status = one(params.status) === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE';
  const cursor = one(params.cursor);
  const query = new URLSearchParams({ limit: '50', status });
  if (q.length >= 2) query.set('q', q);
  if (cursor) query.set('cursor', cursor);
  const canManage = holds(me, 'teacher.manage');
  const adding = canManage && one(params.add) === '1';
  const [res, membersRes] = await Promise.all([
    apiServerGet(`/teachers?${query.toString()}`),
    adding ? apiServerGet('/teachers/linkable-members') : Promise.resolve(undefined),
  ]);
  if (!res.ok) throw new Error(`teachers ${res.status}`);
  const page = TeacherPageSchema.parse(await res.json());
  const members = membersRes?.ok
    ? LinkableMemberListSchema.parse(await membersRes.json()).items
    : [];
  const p = messages.people;
  const link = (extra: Record<string, string>) => {
    const u = new URLSearchParams({ ...(q ? { q } : {}), status, ...extra });
    return `/teachers?${u.toString()}`;
  };

  return (
    <Stack spacing={6}>
      <PageHeader
        title={t('title')}
        body={t('body', { academy })}
        action={
          canManage ? (
            <PlainButton variant="primary" href="?add=1">
              {t('add')}
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
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box component="label" htmlFor="teacher-search" sx={{ fontSize: 14, fontWeight: 600 }}>
            {t('search')}
          </Box>
          <Box
            component="input"
            id="teacher-search"
            name="q"
            type="search"
            defaultValue={q}
            sx={{
              minBlockSize: 48,
              paddingInline: '14px',
              font: 'inherit',
              fontSize: 16,
              color: 'ab.textPrimary',
              bgcolor: 'ab.surface',
              border: '1px solid',
              borderColor: 'ab.borderStrong',
              borderRadius: 2,
            }}
          />
        </Box>
        <Box
          component="button"
          type="submit"
          sx={{
            minBlockSize: 48,
            paddingInline: 3,
            font: 'inherit',
            fontWeight: 600,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'ab.borderStrong',
            bgcolor: 'ab.surface',
            color: 'ab.textPrimary',
            cursor: 'pointer',
          }}
        >
          {t('searchSubmit')}
        </Box>
      </Stack>
      <Box component="nav" aria-label={t('tabs.label')} sx={{ display: 'flex', gap: 1 }}>
        {(['ACTIVE', 'ARCHIVED'] as const).map((s) => (
          <PlainButton
            key={s}
            variant={s === status ? 'primary' : 'secondary'}
            href={`/teachers?status=${s}`}
          >
            {t(`tabs.${s}`)}
          </PlainButton>
        ))}
      </Box>

      {page.items.length === 0 ? (
        status === 'ARCHIVED' ? (
          <EmptyState title={t('archivedEmptyTitle')} body={t('archivedEmptyBody')} />
        ) : q ? (
          <EmptyState
            title={t('noResultsTitle')}
            body={t('noResultsBody')}
            action={{ label: p.students.clearSearch, href: '/teachers' }}
          />
        ) : (
          <EmptyState
            title={t('emptyTitle')}
            body={t('emptyBody')}
            {...(canManage ? { action: { label: t('add'), href: '?add=1' } } : {})}
          />
        )
      ) : (
        <Box
          component="ul"
          sx={{ margin: 0, padding: 0, borderBlockStart: '1px solid', borderColor: 'ab.border' }}
        >
          {page.items.map((teacher) => (
            <Box
              component="li"
              key={teacher.id}
              sx={{ listStyle: 'none', borderBlockEnd: '1px solid', borderColor: 'ab.border' }}
            >
              <Box
                component="a"
                href={`/teachers/${teacher.id}`}
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
                <Stack spacing={0.5} sx={{ minInlineSize: 0, flex: 1 }}>
                  <Text as="span">
                    <strong>{teacher.fullName}</strong>
                  </Text>
                  <Text variant="meta" tone="secondary" as="span">
                    {[teacher.subjects.join(', '), t('classes', { count: teacher.batchCount })]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </Stack>
                <StatusBadge
                  tone={ACCESS_TONE[teacher.access]}
                  label={t(`access.${teacher.access}`)}
                />
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
        <AddTeacherLazy
          members={members}
          labels={{
            form: p.teachers.form,
            common: p.form,
            errors: { ...p.errors, offline: p.form.offline },
          }}
        />
      )}
    </Stack>
  );
}
