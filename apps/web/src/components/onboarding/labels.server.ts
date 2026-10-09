import 'server-only';

import { ACADEMY_TYPES, type Terminology, TERMINOLOGY_TEMPLATES } from '@academybee/contracts';
import { getTranslations } from 'next-intl/server';

import type { StepFormLabels } from './step-form';

/**
 * Every string a setup step shows, formatted here with the academy's own words (ADR-029:
 * class/batch/group, coach/teacher …), so the client needs no ICU runtime.
 */
export async function stepLabels(terms: Terminology, academy: string): Promise<StepFormLabels> {
  const [t, settings, types] = await Promise.all([
    getTranslations('onboarding'),
    getTranslations('academy.settings.fields'),
    getTranslations('console.types'),
  ]);
  const raw = (key: Parameters<typeof t.raw>[0]) => t.raw(key) as string;
  const termsFor = (term: Terminology) => ({
    batches: t('terms.batches', { term: term.batch }),
    teacher: t('terms.teacher', { term: term.teacher }),
  });
  return {
    actions: { back: t('actions.back'), skip: t('actions.skip'), save: t('actions.save') },
    errors: {
      required: t('errors.required'),
      invalid: t('errors.invalid'),
      invalidPhone: t('errors.invalidPhone'),
      invalidEmail: t('errors.invalidEmail'),
      fixFields: t('errors.fixFields'),
      needsCourse: t('errors.needsCourse'),
      needsBatch: t('errors.needsBatch'),
      versionConflict: t('errors.versionConflict'),
      alreadyMember: t('errors.alreadyMember', { academy }),
      offline: t('errors.offline'),
      generic: t('errors.generic'),
      limit: t('students.limit'),
    },
    profile: {
      name: settings('name'),
      phone: settings('phone'),
      phoneHint: settings('phoneHint'),
      email: settings('email'),
      address: settings('address'),
      timezone: settings('timezone'),
      timezoneHint: settings('timezoneHint'),
      currency: settings('currency'),
      logo: t('profile.logo'),
      logoHint: t('profile.logoHint'),
      logoUpload: t('profile.logoUpload'),
      logoReplace: t('profile.logoReplace'),
      logoUploaded: t('profile.logoUploaded'),
      logoAlt: t('profile.logoAlt'),
    },
    type: {
      legend: t('type.legend'),
      options: Object.fromEntries(
        ACADEMY_TYPES.map((k) => {
          const preview = termsFor(TERMINOLOGY_TEMPLATES[k]);
          return [k, { label: types(k), preview: t('type.preview', preview) }];
        }),
      ),
    },
    course: { name: t('course.name'), description: t('course.description') },
    teacher: {
      legend: t('teacher.legend'),
      self: t('teacher.self'),
      invite: t('teacher.invite'),
      name: t('teacher.name'),
      email: t('teacher.email'),
      inviteHint: t('teacher.inviteHint', { academy }),
      pendingTemplate: raw('teacher.pending'),
    },
    batch: {
      name: t('batch.name'),
      capacity: t('batch.capacity'),
      capacityHint: t('batch.capacityHint'),
    },
    students: {
      rowTemplate: raw('students.row'),
      name: t('students.name'),
      parentName: t('students.parentName'),
      parentPhone: t('students.parentPhone'),
      add: t('students.add'),
      removeTemplate: raw('students.remove'),
      max: t('students.max'),
      admissionTemplate: raw('students.admission'),
    },
    timetable: {
      slotTemplate: raw('timetable.slot'),
      day: t('timetable.day'),
      start: t('timetable.start'),
      end: t('timetable.end'),
      add: t('timetable.add'),
      removeTemplate: raw('timetable.remove'),
      endAfterStart: t('timetable.endAfterStart'),
      upcoming: t('timetable.upcoming'),
    },
    days: [1, 2, 3, 4, 5, 6, 7].map((d) => t(`days.d${d}` as 'days.d1')),
  };
}
