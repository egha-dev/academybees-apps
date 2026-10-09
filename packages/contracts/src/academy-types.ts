import { z } from 'zod';

/**
 * Academy types and configurable terminology (ADR-029). The type drives defaults only — the
 * terminology template and onboarding copy — never business logic. Terms are stored as *choices*
 * (`{ batch: 'class' }`) and shown through i18n messages (`terms.batch.class`), so they stay
 * translatable (G-32).
 */
export const ACADEMY_TYPES = [
  'tuition',
  'dance',
  'music',
  'martial_arts',
  'sports',
  'fitness',
  'language',
  'art',
  'other',
] as const;
export const AcademyTypeSchema = z.enum(ACADEMY_TYPES);
export type AcademyType = z.infer<typeof AcademyTypeSchema>;

export const TERM_OPTIONS = {
  batch: ['batch', 'class', 'group'],
  course: ['course', 'program'],
  teacher: ['teacher', 'coach', 'instructor', 'trainer'],
} as const;
export type TermKey = keyof typeof TERM_OPTIONS;

export const TerminologySchema = z.object({
  batch: z.enum(TERM_OPTIONS.batch),
  course: z.enum(TERM_OPTIONS.course),
  teacher: z.enum(TERM_OPTIONS.teacher),
});
export type Terminology = z.infer<typeof TerminologySchema>;

export const DEFAULT_TERMINOLOGY: Terminology = {
  batch: 'batch',
  course: 'course',
  teacher: 'teacher',
};

/** Defaults per type (ADR-029); the academy can change each choice later in Settings. */
export const TERMINOLOGY_TEMPLATES: Record<AcademyType, Terminology> = {
  tuition: { batch: 'batch', course: 'course', teacher: 'teacher' },
  dance: { batch: 'class', course: 'course', teacher: 'teacher' },
  music: { batch: 'class', course: 'course', teacher: 'teacher' },
  martial_arts: { batch: 'class', course: 'program', teacher: 'instructor' },
  sports: { batch: 'group', course: 'program', teacher: 'coach' },
  fitness: { batch: 'class', course: 'program', teacher: 'trainer' },
  language: { batch: 'batch', course: 'course', teacher: 'teacher' },
  art: { batch: 'class', course: 'course', teacher: 'teacher' },
  other: DEFAULT_TERMINOLOGY,
};

/**
 * Read stored terminology defensively: an unknown or missing choice falls back to the default,
 * so a bad value can never break a label.
 */
export function readTerminology(raw: unknown): Terminology {
  const value = (raw ?? {}) as Record<string, unknown>;
  const pick = <K extends TermKey>(key: K): Terminology[K] => {
    const parsed = TerminologySchema.shape[key].safeParse(value[key]);
    return parsed.success ? (parsed.data as Terminology[K]) : DEFAULT_TERMINOLOGY[key];
  };
  return { batch: pick('batch'), course: pick('course'), teacher: pick('teacher') };
}

/** Academy types created before ADR-029's list (seeds, staging) map onto it. */
export function toAcademyType(raw: string): AcademyType {
  if (raw === 'karate') return 'martial_arts';
  const parsed = AcademyTypeSchema.safeParse(raw);
  return parsed.success ? parsed.data : 'other';
}
