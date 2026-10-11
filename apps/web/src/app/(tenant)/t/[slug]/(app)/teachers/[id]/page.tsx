import { ActivityPageSchema, type Teacher, TeacherSchema } from '@academybee/contracts';
import { formatDate } from '@academybee/i18n';
import { StatusBadge } from '@academybee/ui/components/display';
import { EmptyState, PermissionState } from '@academybee/ui/components/feedback';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { TeacherActionsLazy } from '@/components/people/teachers-lazy';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { apiServerGet } from '@/lib/api.server';
import { academyTimeZone, hostContext } from '@/lib/host-context.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('people.teachers');
  return { title: t('metaTitle') };
}

const ACCESS_TONE = { MEMBER: 'success', INVITED: 'info', NONE: 'neutral' } as const;

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '10rem 1fr' }, gap: 1 }}>
      <Text variant="meta" tone="secondary" as="dt">
        {label}
      </Text>
      <Box component="dd" sx={{ margin: 0 }}>
        <Text as="span">{value}</Text>
      </Box>
    </Box>
  );
}

/** Teacher profile (UX §11, §10): contact, what they teach, how they sign in, their classes. */
export default async function TeacherPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; cursor?: string }>;
}) {
  const [{ me, academy }, { id }, query, { context }, t, peopleT, messages] = await Promise.all([
    signedInMember({ experience: 'manage' }),
    params,
    searchParams,
    hostContext(),
    getTranslations('people.teachers'),
    getTranslations('people'),
    getMessages(),
  ]);
  if (!holds(me, 'teacher.read'))
    return (
      <PermissionState title={t('permission.title')} body={t('permission.body', { academy })} />
    );
  const res = /^[0-9a-f-]{36}$/i.test(id) ? await apiServerGet(`/teachers/${id}`) : undefined;
  if (!res || res.status === 404)
    return (
      <EmptyState
        title={t('profile.notFound.title')}
        body={t('profile.notFound.body')}
        action={{ label: t('profile.notFound.action'), href: '/teachers' }}
      />
    );
  if (!res.ok) throw new Error(`teacher ${res.status}`);
  const teacher: Teacher = TeacherSchema.parse(await res.json());
  const timeZone = academyTimeZone(context);
  const date = (v: string) => formatDate(v, { ...(timeZone ? { timeZone } : {}) });
  const tab = query.tab === 'activity' ? 'activity' : 'overview';
  const archived = teacher.status === 'ARCHIVED';
  const p = messages.people;
  const none = t('profile.notGiven');

  let activity: ReactNode = null;
  if (tab === 'activity') {
    const aRes = await apiServerGet(
      `/teachers/${teacher.id}/activity?limit=50${query.cursor ? `&cursor=${encodeURIComponent(query.cursor)}` : ''}`,
    );
    if (!aRes.ok) throw new Error(`teacher activity ${aRes.status}`);
    const page = ActivityPageSchema.parse(await aRes.json());
    activity =
      page.items.length === 0 ? (
        <Text tone="secondary">{peopleT('activity.empty')}</Text>
      ) : (
        <Stack spacing={4}>
          <Stack component="ol" spacing={3} sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {page.items.map((e) => (
              <Box
                component="li"
                key={e.id}
                sx={{
                  borderInlineStart: '3px solid',
                  borderColor: 'ab.border',
                  paddingInlineStart: 3,
                }}
              >
                <Text>
                  {peopleT(`activity.type.${e.type.replace('.', '_') as 'teacher_created'}`)}
                </Text>
                <Text variant="meta" tone="secondary">
                  {date(e.at)}
                  {e.actorName ? ` · ${peopleT('activity.by', { name: e.actorName })}` : ''}
                </Text>
              </Box>
            ))}
          </Stack>
          {page.nextCursor && (
            <Box
              component="a"
              href={`/teachers/${teacher.id}?tab=activity&cursor=${encodeURIComponent(page.nextCursor)}`}
              sx={{ fontWeight: 600, color: 'ab.textPrimary' }}
            >
              {peopleT('activity.loadMore')}
            </Box>
          )}
        </Stack>
      );
  }

  return (
    <Stack spacing={6}>
      <Stack spacing={2}>
        <Box component="a" href="/teachers" sx={{ color: 'ab.textSecondary', fontSize: 14 }}>
          {t('profile.back')}
        </Box>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          sx={{ gap: 3, justifyContent: 'space-between', alignItems: { md: 'flex-end' } }}
        >
          <Stack spacing={1}>
            <Stack direction="row" sx={{ gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <Text variant="title" as="h1">
                {teacher.fullName}
              </Text>
              <StatusBadge
                tone={archived ? 'neutral' : ACCESS_TONE[teacher.access]}
                label={archived ? t('tabs.ARCHIVED') : t(`access.${teacher.access}`)}
              />
            </Stack>
            <Text tone="secondary">{t('profile.since', { date: date(teacher.createdAt) })}</Text>
          </Stack>
          {holds(me, 'teacher.manage') && (
            <TeacherActionsLazy
              teacher={teacher}
              labels={{
                actions: p.teachers.actions,
                edit: p.teachers.edit,
                archive: p.teachers.archive,
                form: p.teachers.form,
                common: p.form,
                errors: { ...p.errors, offline: p.form.offline },
              }}
            />
          )}
        </Stack>
        {archived && (
          <Box role="status" sx={{ padding: 3, borderRadius: 2, bgcolor: 'ab.surfaceRaised' }}>
            <Text>{t('profile.archivedBanner')}</Text>
          </Box>
        )}
      </Stack>

      <Box
        component="nav"
        aria-label={t('profile.tabs.label')}
        sx={{ borderBlockEnd: '1px solid', borderColor: 'ab.border' }}
      >
        <Box component="ul" sx={{ display: 'flex', gap: 2, margin: 0, padding: 0 }}>
          {(['overview', 'activity'] as const).map((key) => (
            <Box component="li" key={key} sx={{ listStyle: 'none' }}>
              <Box
                component="a"
                href={
                  key === 'overview'
                    ? `/teachers/${teacher.id}`
                    : `/teachers/${teacher.id}?tab=activity`
                }
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
                {t(`profile.tabs.${key}`)}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      {tab === 'activity' ? (
        activity
      ) : (
        <Box sx={{ display: 'grid', gap: 6, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
          <Stack component="section" spacing={3} aria-labelledby="sec-contact">
            <Text variant="section" as="h2" id="sec-contact">
              {t('profile.contact')}
            </Text>
            <Stack component="dl" spacing={2} sx={{ margin: 0 }}>
              <Fact label={t('profile.email')} value={teacher.email ?? none} />
              <Fact label={t('profile.phone')} value={teacher.phone ?? none} />
              <Fact label={t('profile.subjects')} value={teacher.subjects.join(', ') || none} />
              <Fact
                label={t('profile.access')}
                value={
                  teacher.access === 'MEMBER'
                    ? t('profile.accessMember', { academy })
                    : teacher.access === 'INVITED'
                      ? t('profile.accessInvited', { date: date(teacher.inviteExpiresAt!) })
                      : t('profile.accessNone')
                }
              />
            </Stack>
          </Stack>
          <Stack component="section" spacing={3} aria-labelledby="sec-classes">
            <Text variant="section" as="h2" id="sec-classes">
              {t('profile.classes')}
            </Text>
            {teacher.batches.length === 0 ? (
              <Text tone="secondary">{t('profile.noClasses')}</Text>
            ) : (
              <Stack component="ul" spacing={2} sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {teacher.batches.map((b) => (
                  <Box component="li" key={b.id}>
                    <Text>
                      <strong>{b.name}</strong>
                    </Text>
                    <Text variant="meta" tone="secondary">
                      {b.courseName}
                    </Text>
                  </Box>
                ))}
              </Stack>
            )}
          </Stack>
        </Box>
      )}
    </Stack>
  );
}
