import { z } from 'zod';

import { AcademyTypeSchema, TerminologySchema } from './academy-types.js';
import { ONBOARDING_STEPS, OnboardingStepSchema } from './console.js';

/**
 * Guided setup (UX v1.1 §4–5, C-08, C-92): Profile → Type → Course → Teacher → Batch → Students →
 * Timetable → Ready. Every step except Profile and Type may be skipped; each save persists at once
 * so the owner can leave and resume on any device. Saving a step again edits what it created.
 */
export const SAVED_STEPS = ONBOARDING_STEPS.filter((s) => s !== 'ready') as readonly Exclude<
  (typeof ONBOARDING_STEPS)[number],
  'ready'
>[];
export const SavedStepSchema = z.enum(SAVED_STEPS as unknown as [string, ...string[]]);
export type SavedStep = Exclude<z.infer<typeof OnboardingStepSchema>, 'ready'>;

/** Steps that can't be skipped (C-08). */
export const REQUIRED_STEPS = ['profile', 'type'] as const satisfies readonly SavedStep[];

const Name = z.string().trim().min(1).max(120);
const OptionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
const Email = z.string().trim().toLowerCase().max(320).pipe(z.email());
/** Indian mobile numbers may be typed as 10 digits; anything else in E.164. */
export const PhoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ''))
  .transform((v) => (/^[6-9]\d{9}$/.test(v) ? `+91${v}` : v))
  .pipe(z.string().regex(/^\+[1-9]\d{6,14}$/));
/** `HH:MM`, 24-hour. */
const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const ProfileStepSchema = z.object({
  name: Name,
  phone: PhoneSchema.optional(),
  email: Email.optional(),
  address: OptionalText(300),
  /** IANA timezone, checked against the runtime's list. */
  timezone: z
    .string()
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'invalid_timezone')
    .default('Asia/Kolkata'),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('INR'),
});
export const TypeStepSchema = z.object({ academyType: AcademyTypeSchema });
export const CourseStepSchema = z.object({ name: Name, description: OptionalText(1000) });
export const TeacherStepSchema = z.discriminatedUnion('mode', [
  /** The owner teaches this course themself. */
  z.object({ mode: z.literal('self') }),
  /** Invite someone; they join with the teacher role (C-67). */
  z.object({ mode: z.literal('invite'), name: Name, email: Email }),
]);
export const BatchStepSchema = z.object({
  name: Name,
  capacity: z.number().int().min(1).max(10_000).nullable().default(null),
});
export const StudentInputSchema = z.object({
  fullName: Name,
  parentName: OptionalText(120),
  parentPhone: PhoneSchema.optional(),
});
export const StudentsStepSchema = z.object({
  students: z.array(StudentInputSchema).min(1).max(20),
});
export const SlotSchema = z
  .object({ weekday: z.number().int().min(1).max(7), start: Time, end: Time })
  .refine((s) => s.end > s.start, { message: 'end_before_start', path: ['end'] });
export const TimetableStepSchema = z.object({ slots: z.array(SlotSchema).min(1).max(14) });

export const STEP_SCHEMAS = {
  profile: ProfileStepSchema,
  type: TypeStepSchema,
  course: CourseStepSchema,
  teacher: TeacherStepSchema,
  batch: BatchStepSchema,
  students: StudentsStepSchema,
  timetable: TimetableStepSchema,
} as const satisfies Record<SavedStep, z.ZodType>;
export type StepInput<S extends SavedStep> = z.infer<(typeof STEP_SCHEMAS)[S]>;

/** `PUT /onboarding/steps/:step` — save (with that step's data) or skip; `version` from GET. */
export const SaveStepRequestSchema = z.object({
  action: z.enum(['save', 'skip']),
  version: z.number().int().min(1),
  data: z.unknown().optional(),
});
export type SaveStepRequest = z.infer<typeof SaveStepRequestSchema>;

export const STEP_STATUSES = ['pending', 'done', 'skipped'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

/** What each step created, so saving it again edits instead of adding (C-92). */
export const StepRecordSchema = z.object({
  status: z.enum(STEP_STATUSES),
  completedAt: z.iso.datetime().optional(),
  refIds: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
});
export type StepRecord = z.infer<typeof StepRecordSchema>;

/** `GET /onboarding` (and every save): where the owner is and what they entered so far. */
export const OnboardingStateSchema = z.object({
  currentStep: OnboardingStepSchema,
  completed: z.boolean(),
  /** Profile and Type done: the academy can open. */
  canComplete: z.boolean(),
  version: z.number().int(),
  steps: z.record(z.string(), z.object({ status: z.enum(STEP_STATUSES) })),
  terminology: TerminologySchema,
  values: z.object({
    profile: z.object({
      name: z.string(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
      address: z.string().nullable(),
      timezone: z.string(),
      currency: z.string(),
    }),
    type: z.object({ academyType: z.string() }),
    course: z.object({ name: z.string(), description: z.string().nullable() }).nullable(),
    teacher: z
      .object({
        mode: z.enum(['self', 'invite']),
        name: z.string(),
        email: z.string().nullable(),
        invitationPending: z.boolean(),
      })
      .nullable(),
    batch: z.object({ name: z.string(), capacity: z.number().int().nullable() }).nullable(),
    students: z.array(
      z.object({
        fullName: z.string(),
        admissionNo: z.string(),
        parentName: z.string().nullable(),
        parentPhone: z.string().nullable(),
      }),
    ),
    timetable: z.object({
      slots: z.array(z.object({ weekday: z.number().int(), start: z.string(), end: z.string() })),
      /** The next generated classes (academy-local date and times). */
      upcoming: z.array(z.object({ date: z.string(), start: z.string(), end: z.string() })),
      sessionCount: z.number().int(),
    }),
  }),
});
export type OnboardingState = z.infer<typeof OnboardingStateSchema>;

/** Next step after `step` in the guided order (Ready after the last). */
export function nextOnboardingStep(step: SavedStep): z.infer<typeof OnboardingStepSchema> {
  const i = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[Math.min(i + 1, ONBOARDING_STEPS.length - 1)]!;
}
