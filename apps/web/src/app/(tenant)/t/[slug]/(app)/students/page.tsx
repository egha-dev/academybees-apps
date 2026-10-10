import {
  CustomFieldListSchema,
  localDate,
  STUDENT_STATUSES,
  StudentPageSchema,
} from '@academybee/contracts';
import { InlineAlert } from '@academybee/ui/components/alert';
import { PermissionState } from '@academybee/ui/components/feedback';
import { Stack } from '@academybee/ui/components/layout';
import { PlainButton } from '@academybee/ui/components/plain-button';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMessages, getTranslations } from 'next-intl/server';

import { AddStudentLazy, StudentsBrowserLazy } from '@/components/people/students-lazy';
import { PageHeader } from '@/components/shell/page-header';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { apiServerGet } from '@/lib/api.server';
import { peopleEnabled } from '@/lib/flags.server';
import { academyTimeZone, hostContext } from '@/lib/host-context.server';
import { homeFor } from '@/lib/session.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('people.students');
  return { title: t('metaTitle') };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * Students (UX §11.3): search → Student 360. The first page is read on the server (the URL keeps
 * search and filters); searching, filtering and "show more" happen in the lazily loaded browser.
 * Add Student opens from the header, Global Add or `?add=1`.
 */
export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ me, academy }, enabled, params, { context }, t, shellT, messages] = await Promise.all([
    signedInMember({ experience: 'manage' }),
    peopleEnabled(),
    searchParams,
    hostContext(),
    getTranslations('people'),
    getTranslations('shell.permission'),
    getMessages(),
  ]);
  if (!enabled) notFound();
  if (!holds(me, 'student.read'))
    return (
      <PermissionState
        title={t('students.permission.title')}
        body={t('students.permission.body', { academy })}
        action={{ label: shellT('action'), href: homeFor(me) }}
      />
    );
  const status = (STUDENT_STATUSES as readonly string[]).includes(one(params.status))
    ? one(params.status)
    : '';
  const query = {
    q: one(params.q).slice(0, 60),
    status,
    archived: one(params.archived) === 'true',
  };
  const api = new URLSearchParams({ limit: '50' });
  if (query.q.trim().length >= 2) api.set('q', query.q.trim());
  if (query.status) api.set('status', query.status);
  if (query.archived) api.set('archived', 'true');
  const canCreate = holds(me, 'student.create');
  const canImport = holds(me, 'student.import');
  const adding = canCreate && one(params.add) === '1';
  const [res, fieldsRes] = await Promise.all([
    apiServerGet(`/students?${api.toString()}`),
    adding ? apiServerGet('/custom-fields') : Promise.resolve(undefined),
  ]);
  if (!res.ok) throw new Error(`students ${res.status}`);
  const page = StudentPageSchema.parse(await res.json());
  const fields = fieldsRes?.ok ? CustomFieldListSchema.parse(await fieldsRes.json()).items : [];
  const p = messages.people;
  const timeZone = academyTimeZone(context) ?? 'Asia/Kolkata';

  return (
    <Stack spacing={6}>
      <PageHeader
        title={t('students.title')}
        body={t('students.body', { academy })}
        action={
          canCreate || canImport ? (
            <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
              {canImport && (
                <PlainButton href="/students/import">{t('students.import')}</PlainButton>
              )}
              {canCreate && (
                <PlainButton variant="primary" href="?add=1">
                  {t('students.add')}
                </PlainButton>
              )}
            </Stack>
          ) : undefined
        }
      />
      {one(params.pick) === 'parent' && (
        <InlineAlert tone="info">{t('students.pickParent')}</InlineAlert>
      )}
      <StudentsBrowserLazy
        initial={page}
        initialQuery={query}
        canCreate={canCreate}
        labels={{ students: p.students, status: p.status, add: p.students.add }}
      />
      {adding && (
        <AddStudentLazy
          fields={fields}
          today={localDate(new Date(), timeZone)}
          canAddParent={holds(me, 'parent.manage')}
          labels={{
            add: p.add,
            form: p.form,
            gender: p.gender,
            relationship: p.relationship,
            duplicates: p.duplicates,
            errors: p.errors,
          }}
        />
      )}
    </Stack>
  );
}
