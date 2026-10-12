import { CourseListSchema } from '@academybee/contracts';
import { PermissionState } from '@academybee/ui/components/feedback';
import { Stack } from '@academybee/ui/components/layout';
import type { Metadata } from 'next';
import { getMessages, getTranslations } from 'next-intl/server';

import { SettingsTabs } from '@/components/academy/settings-tabs';
import { CoursesEditorLazy } from '@/components/scheduling/courses-lazy';
import { PageHeader } from '@/components/shell/page-header';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { apiServerGet } from '@/lib/api.server';
import { homeFor } from '@/lib/session.server';
import { academyTerms, withWords, wordsOf } from '@/lib/terms.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const [t, terms] = await Promise.all([getTranslations('scheduling.courses'), academyTerms()]);
  return { title: t('metaTitle', { course: terms.course }) };
}

/** Settings → Courses (PRD v3 §9): what students learn and its levels. Changed by owners. */
export default async function CoursesPage() {
  const [{ me, academy }, terms, t, academyT, shellT, messages] = await Promise.all([
    signedInMember({ experience: 'manage' }),
    academyTerms(),
    getTranslations('scheduling.courses'),
    getTranslations('academy'),
    getTranslations('shell.permission'),
    getMessages(),
  ]);
  const words = wordsOf(terms);
  if (!holds(me, 'course.read'))
    return (
      <PermissionState
        title={t('permission.title', words)}
        body={t('permission.body', { academy })}
        action={{ label: shellT('action'), href: homeFor(me) }}
      />
    );
  const [active, archived] = await Promise.all([
    apiServerGet('/courses?status=ACTIVE'),
    apiServerGet('/courses?status=ARCHIVED'),
  ]);
  if (!active.ok) throw new Error(`courses ${active.status}`);
  const courses = CourseListSchema.parse(await active.json()).items;
  const old = archived.ok ? CourseListSchema.parse(await archived.json()).items : [];
  return (
    <Stack spacing={6}>
      <PageHeader title={academyT('settings.title')} body={academyT('settings.body')} />
      <SettingsTabs current="courses" />
      <PageHeader title={t('title', words)} body={t('body', { academy })} />
      <CoursesEditorLazy
        courses={courses}
        archived={old}
        canManage={holds(me, 'course.manage')}
        labels={{
          courses: withWords(messages.scheduling.courses, words),
          common: messages.people.form,
          errors: { ...messages.people.errors, offline: messages.people.form.offline },
        }}
      />
    </Stack>
  );
}
