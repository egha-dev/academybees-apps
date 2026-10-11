import {
  ActivityPageSchema,
  ConsentHistorySchema,
  CustomFieldListSchema,
  type Student,
  StudentSchema,
} from '@academybee/contracts';
import { formatDate } from '@academybee/i18n';
import { StatusBadge } from '@academybee/ui/components/display';
import { EmptyState, PermissionState } from '@academybee/ui/components/feedback';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import {
  ConsentRecordLazy,
  HealthNoteLazy,
  ParentActionsLazy,
  StudentActionsLazy,
  StudentPhotoLazy,
} from '@/components/people/students-lazy';
import type { PeopleErrorLabels } from '@/components/people/errors';
import { STATUS_TONE } from '@/components/people/status';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { apiServerGet } from '@/lib/api.server';
import { academyTimeZone, hostContext } from '@/lib/host-context.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('people.students');
  return { title: t('metaTitle') };
}

function Section({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <Stack component="section" spacing={3} aria-labelledby={id}>
      <Text variant="section" as="h2" id={id}>
        {title}
      </Text>
      {children}
    </Stack>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '12rem 1fr' }, gap: 1 }}>
      <Text variant="meta" tone="secondary" as="dt">
        {label}
      </Text>
      <Box component="dd" sx={{ margin: 0 }}>
        <Text as="span">{value}</Text>
      </Box>
    </Box>
  );
}

function yearsBetween(dob: string, today: Date): number {
  const [y, m, d] = dob.split('-').map(Number) as [number, number, number];
  let years = today.getUTCFullYear() - y;
  if (today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d))
    years -= 1;
  return years;
}

/**
 * Student 360 (UX §11.4, §10): who the student is, their parents, restricted notes, consent and
 * classes — and what happened (Activity). Tabs for later phases (attendance, fees, learning…)
 * appear with those phases; nothing is a placeholder. Read on the server; actions load on use.
 */
export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; cursor?: string }>;
}) {
  const [{ me, academy }, { id }, query, { context }, t, messages] = await Promise.all([
    signedInMember({ experience: 'manage' }),
    params,
    searchParams,
    hostContext(),
    getTranslations('people'),
    getMessages(),
  ]);
  if (!holds(me, 'student.read'))
    return (
      <PermissionState
        title={t('students.permission.title')}
        body={t('students.permission.body', { academy })}
      />
    );
  const res = /^[0-9a-f-]{36}$/i.test(id) ? await apiServerGet(`/students/${id}`) : undefined;
  if (!res || res.status === 404)
    return (
      <EmptyState
        title={t('profile.notFound.title')}
        body={t('profile.notFound.body')}
        action={{ label: t('profile.notFound.action'), href: '/students' }}
      />
    );
  if (!res.ok) throw new Error(`student ${res.status}`);
  const student: Student = StudentSchema.parse(await res.json());
  const timeZone = academyTimeZone(context);
  const date = (v: string) => formatDate(v, { ...(timeZone ? { timeZone } : {}) });
  const tab = query.tab === 'activity' ? 'activity' : 'overview';
  const archived = student.archivedAt !== null;
  const restoreOpen =
    student.restorableUntil !== null &&
    student.restorableUntil >= new Date().toISOString().slice(0, 10);
  const can = {
    update: holds(me, 'student.update') && !archived,
    archive: holds(me, 'student.archive'),
    parents: holds(me, 'parent.manage') && !archived,
    healthRead: holds(me, 'student.health.read'),
    healthManage: holds(me, 'student.health.manage') && !archived,
    consentRead: holds(me, 'parent.read'),
  };
  const p = messages.people;
  const errorLabels = { ...p.errors, offline: p.form.offline };
  const status = archived ? 'ARCHIVED' : student.status;

  return (
    <Stack spacing={6}>
      <Stack spacing={2}>
        <Box component="a" href="/students" sx={{ color: 'ab.textSecondary', fontSize: 14 }}>
          {t('profile.back')}
        </Box>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          sx={{ gap: 3, justifyContent: 'space-between', alignItems: { md: 'flex-end' } }}
        >
          <Stack spacing={2}>
            <StudentPhotoLazy
              studentId={student.id}
              name={student.fullName}
              hasPhoto={student.hasPhoto}
              photoConsent={student.photoConsent}
              canManage={can.update}
              labels={p.photo}
            />
            <Stack direction="row" sx={{ gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <Text variant="title" as="h1">
                {student.fullName}
              </Text>
              <StatusBadge tone={STATUS_TONE[status]} label={t(`status.${status}`)} />
            </Stack>
            <Text tone="secondary">
              {t('profile.admission', { number: student.admissionNo })}
              {' · '}
              {t('profile.since', { date: date(student.admissionDate) })}
            </Text>
          </Stack>
          <StudentActionsLazy
            student={{
              id: student.id,
              fullName: student.fullName,
              status: student.status,
              version: student.version,
              archived,
              restoreOpen,
            }}
            draft={student}
            can={can}
            consequence={t('statusChange.consequenceClasses', {
              count: student.enrolments.length,
            })}
            labels={{
              actions: p.actions,
              edit: p.edit,
              statusChange: p.statusChange,
              archive: p.archive,
              status: p.status,
              form: p.form,
              gender: p.gender,
              relationship: p.relationship,
              parents: p.parents,
              add: p.add,
              undo: p.undo,
              undone: p.undone,
              undoFailed: p.undoFailed,
              errors: errorLabels,
            }}
            fieldsPath="/custom-fields"
          />
        </Stack>
        {archived && (
          <Box
            role="status"
            sx={{
              padding: 3,
              borderRadius: 2,
              bgcolor: 'ab.surfaceRaised',
              border: '1px solid',
              borderColor: 'ab.border',
            }}
          >
            <Text>
              {restoreOpen
                ? t('profile.archivedBanner', {
                    date: date(student.archivedAt!),
                    until: date(student.restorableUntil!),
                  })
                : t('profile.restoreClosed')}
            </Text>
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
                    ? `/students/${student.id}`
                    : `/students/${student.id}?tab=activity`
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
        <Activity studentId={student.id} cursor={query.cursor} date={date} />
      ) : (
        <Overview
          student={student}
          date={date}
          can={can}
          errorLabels={errorLabels}
          familyLink={holds(me, 'parent.manage')}
        />
      )}
    </Stack>
  );
}

async function Overview({
  student,
  date,
  can,
  errorLabels,
  familyLink,
}: {
  familyLink: boolean;
  student: Student;
  date: (v: string) => string;
  can: { parents: boolean; healthRead: boolean; healthManage: boolean; consentRead: boolean };
  errorLabels: PeopleErrorLabels;
}) {
  const [t, messages, fieldsRes, consentRes] = await Promise.all([
    getTranslations('people'),
    getMessages(),
    apiServerGet('/custom-fields'),
    can.consentRead ? apiServerGet(`/students/${student.id}/consents`) : Promise.resolve(undefined),
  ]);
  const fields = fieldsRes.ok ? CustomFieldListSchema.parse(await fieldsRes.json()).items : [];
  const consents = consentRes?.ok ? ConsentHistorySchema.parse(await consentRes.json()).items : [];
  const p = messages.people;
  const none = t('profile.notGiven');
  const address = student.address
    ? [
        student.address.line1,
        student.address.line2,
        student.address.city,
        student.address.state,
        student.address.postalCode,
      ]
        .filter(Boolean)
        .join(', ')
    : '';
  const customValue = (key: string) => {
    const field = fields.find((f) => f.key === key);
    const raw = student.customFields[key];
    if (raw === undefined || raw === null || raw === '') return null;
    if (field?.type === 'SELECT')
      return field.options.find((o) => o.value === raw)?.label ?? String(raw);
    if (field?.type === 'DATE' && typeof raw === 'string') return date(raw);
    return String(raw);
  };
  const shownFields = fields.filter((f) => !f.archived || customValue(f.key) !== null);

  return (
    <Box sx={{ display: 'grid', gap: 6, gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' } }}>
      <Stack spacing={6}>
        <Section title={t('profile.sections.profile')} id="sec-profile">
          <Stack component="dl" spacing={2} sx={{ margin: 0 }}>
            <Fact label={t('profile.fields.preferredName')} value={student.preferredName ?? none} />
            <Fact
              label={t('profile.fields.dateOfBirth')}
              value={
                student.dateOfBirth
                  ? `${date(student.dateOfBirth)} · ${t('profile.fields.age', { years: yearsBetween(student.dateOfBirth, new Date()) })}`
                  : none
              }
            />
            <Fact
              label={t('profile.fields.gender')}
              value={student.gender ? t(`gender.${student.gender}`) : none}
            />
            <Fact label={t('profile.fields.school')} value={student.schoolName ?? none} />
            <Fact label={t('profile.fields.grade')} value={student.grade ?? none} />
            <Fact label={t('profile.fields.admissionDate')} value={date(student.admissionDate)} />
            <Fact label={t('profile.fields.address')} value={address || none} />
            <Fact
              label={t('profile.fields.emergency')}
              value={
                student.emergencyContact
                  ? [
                      student.emergencyContact.name,
                      student.emergencyContact.relationship,
                      student.emergencyContact.phone,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : none
              }
            />
            <Fact label={t('profile.fields.tags')} value={student.tags.join(', ') || none} />
          </Stack>
        </Section>

        {shownFields.length > 0 && (
          <Section title={t('profile.sections.custom')} id="sec-custom">
            <Stack component="dl" spacing={2} sx={{ margin: 0 }}>
              {shownFields.map((f) => (
                <Fact key={f.key} label={f.label} value={customValue(f.key) ?? none} />
              ))}
            </Stack>
          </Section>
        )}

        <Section title={t('profile.sections.classes')} id="sec-classes">
          {student.enrolments.length === 0 ? (
            <Text tone="secondary">{t('profile.noClasses')}</Text>
          ) : (
            <Stack component="ul" spacing={2} sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {student.enrolments.map((e) => (
                <Box component="li" key={e.batchId}>
                  <Text>
                    <strong>{e.batchName}</strong>
                  </Text>
                  <Text variant="meta" tone="secondary">
                    {t('profile.classSince', { course: e.courseName, date: date(e.startedOn) })}
                  </Text>
                </Box>
              ))}
            </Stack>
          )}
        </Section>
      </Stack>

      <Stack spacing={6}>
        <Section title={t('profile.sections.parents')} id="sec-parents">
          {student.parents.length === 0 && <Text tone="secondary">{t('profile.noParents')}</Text>}
          <Stack component="ul" spacing={3} sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {student.parents.map((parent) => (
              <Box
                component="li"
                key={parent.linkId}
                sx={{ padding: 3, borderRadius: 2, border: '1px solid', borderColor: 'ab.border' }}
              >
                <Stack spacing={1}>
                  <Text>
                    <strong>{parent.fullName}</strong> · {t(`relationship.${parent.relationship}`)}
                  </Text>
                  {(parent.phone || parent.email) && (
                    <Text variant="bodySmall" tone="secondary">
                      {[parent.phone, parent.email].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                  <Text variant="meta" tone="secondary">
                    {[
                      parent.isPrimaryContact ? t('profile.primary') : null,
                      parent.pickupAuthorised ? t('profile.pickup') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  <ParentActionsLazy
                    studentId={student.id}
                    studentName={student.fullName}
                    link={parent}
                    canManage={can.parents}
                    canInvite={familyLink}
                    inviteUntil={parent.inviteExpiresAt ? date(parent.inviteExpiresAt) : undefined}
                    labels={{
                      parents: p.parents,
                      relationship: p.relationship,
                      form: p.form,
                      status: p.status,
                      undo: p.undo,
                      undone: p.undone,
                      undoFailed: p.undoFailed,
                      errors: errorLabels,
                    }}
                  />
                </Stack>
              </Box>
            ))}
          </Stack>
        </Section>

        {can.healthRead && (
          <Section title={t('profile.sections.health')} id="sec-health">
            <Text variant="bodySmall" tone="secondary">
              {t('health.restricted')}
            </Text>
            <HealthNoteLazy
              studentId={student.id}
              exists={student.hasHealthNote}
              canManage={can.healthManage}
              labels={{ health: p.health, form: p.form, errors: errorLabels }}
            />
          </Section>
        )}

        {can.consentRead && (
          <Section title={t('profile.sections.consent')} id="sec-consent">
            {consents.length === 0 ? (
              <Text tone="secondary">{t('consent.none')}</Text>
            ) : (
              <Stack component="ul" spacing={2} sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {consents.map((c) => (
                  <Box component="li" key={c.id}>
                    <Text variant="bodySmall">
                      {t('consent.line', {
                        parent: c.parentName,
                        action: c.action,
                        channel: t(`consent.channels.${c.channel}`),
                        date: date(c.recordedAt),
                      })}
                    </Text>
                    <Text variant="meta" tone="secondary">
                      {c.purposes.map((purpose) => t(`consent.purpose.${purpose}`)).join(' · ')}
                      {' · '}
                      {t('consent.notice', { version: c.noticeVersion })}
                    </Text>
                  </Box>
                ))}
              </Stack>
            )}
            {can.parents && student.parents.length > 0 && (
              <ConsentRecordLazy
                studentId={student.id}
                parents={student.parents.map((x) => ({ id: x.parentId, name: x.fullName }))}
                labels={{ consent: p.consent, form: p.form, errors: errorLabels }}
              />
            )}
          </Section>
        )}
      </Stack>
    </Box>
  );
}

async function Activity({
  studentId,
  cursor,
  date,
}: {
  studentId: string;
  cursor: string | undefined;
  date: (v: string) => string;
}) {
  const t = await getTranslations('people');
  const res = await apiServerGet(
    `/students/${studentId}/activity?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
  );
  if (!res.ok) throw new Error(`activity ${res.status}`);
  const page = ActivityPageSchema.parse(await res.json());
  if (page.items.length === 0) return <Text tone="secondary">{t('activity.empty')}</Text>;
  const line = (e: (typeof page.items)[number]): string => {
    const d = e.data;
    // Message keys use `_` where activity types use `.` (dots nest in the catalogue).
    switch (e.type) {
      case 'student.status_changed':
        return t('activity.type.student_status_changed', {
          to: t(`status.${String(d.to) as 'ACTIVE'}`),
        });
      case 'parent.linked':
        return t('activity.type.parent_linked', {
          relationship: t(`relationship.${String(d.relationship) as 'MOTHER'}`),
        });
      case 'parent.unlinked':
        return t('activity.type.parent_unlinked', {
          relationship: t(`relationship.${String(d.relationship) as 'MOTHER'}`),
        });
      case 'consent.recorded':
        return t('activity.type.consent_recorded', { action: String(d.action) });
      default:
        return t(`activity.type.${e.type.replace('.', '_') as 'student_created'}`);
    }
  };
  return (
    <Stack spacing={4}>
      <Stack component="ol" spacing={3} sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {page.items.map((e) => (
          <Box
            component="li"
            key={e.id}
            sx={{ borderInlineStart: '3px solid', borderColor: 'ab.border', paddingInlineStart: 3 }}
          >
            <Text>{line(e)}</Text>
            <Text variant="meta" tone="secondary">
              {date(e.at)}
              {e.actorName ? ` · ${t('activity.by', { name: e.actorName })}` : ''}
            </Text>
          </Box>
        ))}
      </Stack>
      {page.nextCursor && (
        <Box
          component="a"
          href={`/students/${studentId}?tab=activity&cursor=${encodeURIComponent(page.nextCursor)}`}
          sx={{ fontWeight: 600, color: 'ab.textPrimary' }}
        >
          {t('activity.loadMore')}
        </Box>
      )}
    </Stack>
  );
}
