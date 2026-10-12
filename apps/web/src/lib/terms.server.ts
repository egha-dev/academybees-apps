import { DEFAULT_TERMINOLOGY, type Terminology } from '@academybee/contracts';
import { getTranslations } from 'next-intl/server';

import { hostContext } from './host-context.server';

/** The academy's own words (ADR-029, C-118), from the request's academy context. */
export async function academyTerms(): Promise<Terminology> {
  const { context } = await hostContext();
  return context && 'terminology' in context ? context.terminology : DEFAULT_TERMINOLOGY;
}

export type TermLabels = Record<
  | 'batch'
  | 'batches'
  | 'Batch'
  | 'Batches'
  | 'course'
  | 'courses'
  | 'Course'
  | 'Courses'
  | 'teacher'
  | 'teachers'
  | 'Teacher'
  | 'Teachers',
  string
>;

/**
 * Every form of the academy's words, resolved through the catalogue's ICU selects (never by
 * gluing strings together, ADR-040). Server components use it directly; client components get
 * it from `TermsProvider` (`useTerm`).
 */
export async function termsFor(terminology?: Terminology): Promise<TermLabels> {
  const terms = terminology ?? (await academyTerms());
  const t = await getTranslations('common.terms');
  const batch = { term: terms.batch };
  const course = { term: terms.course };
  const teacher = { term: terms.teacher };
  return {
    batch: t('batch', batch),
    batches: t('batches', batch),
    Batch: t('Batch', batch),
    Batches: t('Batches', batch),
    course: t('course', course),
    courses: t('courses', course),
    Course: t('Course', course),
    Courses: t('Courses', course),
    teacher: t('teacher', teacher),
    teachers: t('teachers', teacher),
    Teacher: t('Teacher', teacher),
    Teachers: t('Teachers', teacher),
  };
}
