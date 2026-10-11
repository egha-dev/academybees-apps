import { z } from 'zod';

import { CursorPageQuerySchema, cursorPageSchema } from './pagination.js';
import { StudentStatusSchema } from './people.js';
import { CalendarDateSchema } from './students.js';

/**
 * Courses, batches, their teachers and enrolments (Phase 5 S2; PRD v3 §9, G-27; C-120, C-121).
 * Dates are academy-local `YYYY-MM-DD`; weekdays are ISO (1 = Monday … 7 = Sunday).
 */

const Name = z.string().trim().min(1).max(120);
const Version = z.number().int().min(1);
export const WeekdaySchema = z.number().int().min(1).max(7);

/** A student day plan (C-120): the days they come. Empty = every day the batch meets. */
export const WeekdaysSchema = z
  .array(WeekdaySchema)
  .max(7)
  .transform((d) => [...new Set(d)].sort((a, b) => a - b));

export const SCHEDULE_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export const ScheduleStatusSchema = z.enum(SCHEDULE_STATUSES);

// ── Courses and levels ────────────────────────────────────────────────────────────────────

export const CourseLevelSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  sortOrder: z.number(),
});
export const CourseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  status: ScheduleStatusSchema,
  version: z.number().int(),
  levels: z.array(CourseLevelSchema),
  batchCount: z.number().int(),
});
export type Course = z.infer<typeof CourseSchema>;
export const CourseListSchema = z.object({ items: z.array(CourseSchema) });
export const CourseListQuerySchema = z.object({ status: ScheduleStatusSchema.default('ACTIVE') });

export const CreateCourseSchema = z.object({
  name: Name,
  description: z.string().trim().max(1000).optional(),
  levels: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
});
export const UpdateCourseSchema = z.object({
  version: Version,
  name: Name.optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  status: ScheduleStatusSchema.optional(),
});
export const CreateLevelSchema = z.object({ name: z.string().trim().min(1).max(80) });
/** Rename and/or move a level (`sortOrder`). */
export const UpdateLevelSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

// ── Batches ───────────────────────────────────────────────────────────────────────────────

export const BatchTeacherSchema = z.object({
  teacherId: z.uuid(),
  fullName: z.string(),
  isPrimary: z.boolean(),
});
/** Students expected on one weekday the batch meets (C-121). */
export const DayLoadSchema = z.object({ weekday: WeekdaySchema, students: z.number().int() });

export const BatchListItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  courseId: z.uuid(),
  courseName: z.string(),
  levelName: z.string().nullable(),
  branchId: z.uuid(),
  status: ScheduleStatusSchema,
  capacity: z.number().int().nullable(),
  /** Students with an open enrolment today. */
  enrolled: z.number().int(),
  /** Weekdays it meets (current weekly pattern) and the fullest of them. */
  weekdays: z.array(WeekdaySchema),
  fullestDay: DayLoadSchema.nullable(),
  teachers: z.array(BatchTeacherSchema),
  nextSessionAt: z.string().nullable(),
});
export type BatchListItem = z.infer<typeof BatchListItemSchema>;
export const BatchPageSchema = cursorPageSchema(BatchListItemSchema);
export const BatchListQuerySchema = CursorPageQuerySchema.extend({
  q: z.string().trim().min(2).max(60).optional(),
  status: ScheduleStatusSchema.default('ACTIVE'),
  courseId: z.uuid().optional(),
  teacherId: z.uuid().optional(),
  branchId: z.uuid().optional(),
});
export type BatchListQuery = z.infer<typeof BatchListQuerySchema>;

export const BatchSchema = BatchListItemSchema.extend({
  levelId: z.uuid().nullable(),
  startsOn: z.string().nullable(),
  endsOn: z.string().nullable(),
  version: z.number().int(),
  createdAt: z.string(),
  /** Students expected per weekday it meets (C-121). */
  dayLoad: z.array(DayLoadSchema),
});
export type Batch = z.infer<typeof BatchSchema>;

const BatchFields = {
  name: Name,
  courseId: z.uuid(),
  levelId: z.uuid().nullable().optional(),
  branchId: z.uuid().optional(),
  capacity: z.number().int().min(1).max(10_000).nullable().optional(),
  startsOn: CalendarDateSchema.nullable().optional(),
  endsOn: CalendarDateSchema.nullable().optional(),
};
const datesInOrder = (b: {
  startsOn?: string | null | undefined;
  endsOn?: string | null | undefined;
}) => !b.startsOn || !b.endsOn || b.endsOn >= b.startsOn;

export const CreateBatchSchema = z
  .object({ ...BatchFields, teacherIds: z.array(z.uuid()).max(10).default([]) })
  .refine(datesInOrder, { message: 'ends_before_start', path: ['endsOn'] });
export const UpdateBatchSchema = z
  .object({
    version: Version,
    name: Name.optional(),
    levelId: z.uuid().nullable().optional(),
    capacity: z.number().int().min(1).max(10_000).nullable().optional(),
    startsOn: CalendarDateSchema.nullable().optional(),
    endsOn: CalendarDateSchema.nullable().optional(),
    status: ScheduleStatusSchema.optional(),
  })
  .refine(datesInOrder, { message: 'ends_before_start', path: ['endsOn'] });
/** `PUT /batches/:id/teachers`: the full list; the first primary one leads (default: first). */
export const SetBatchTeachersSchema = z.object({
  teachers: z
    .array(z.object({ teacherId: z.uuid(), isPrimary: z.boolean().default(false) }))
    .max(10),
});

// ── Enrolments, day plans, transfer (G-27, C-120) ─────────────────────────────────────────

export const EnrolmentSchema = z.object({
  id: z.uuid(),
  batchId: z.uuid(),
  studentId: z.uuid(),
  studentName: z.string(),
  admissionNo: z.string(),
  studentStatus: StudentStatusSchema,
  startedOn: z.string(),
  endedOn: z.string().nullable(),
  /** Empty = every day the batch meets. */
  weekdays: z.array(WeekdaySchema),
  /** Classes a week this student attends with the current pattern. */
  classesPerWeek: z.number().int(),
});
export type Enrolment = z.infer<typeof EnrolmentSchema>;
export const RosterSchema = z.object({
  on: z.string(),
  batchWeekdays: z.array(WeekdaySchema),
  items: z.array(EnrolmentSchema),
});
export const RosterQuerySchema = z.object({ on: CalendarDateSchema.optional() });

/** Days that would go over capacity, returned as a 409 `CONFLICT` detail unless confirmed. */
export const CAPACITY_ISSUE = 'over_capacity';

export const EnrolStudentSchema = z.object({
  studentId: z.uuid(),
  startedOn: CalendarDateSchema.optional(),
  weekdays: WeekdaysSchema.default([]),
  /** Staff saw the per-day capacity warning and enrol anyway. */
  confirmOverCapacity: z.boolean().default(false),
});
export const ChangeEnrolmentDaysSchema = z.object({
  /** First day of the new plan; the current enrolment ends the day before. */
  from: CalendarDateSchema,
  weekdays: WeekdaysSchema,
  confirmOverCapacity: z.boolean().default(false),
});
export const EndEnrolmentSchema = z.object({
  /** Last day in the batch. */
  endedOn: CalendarDateSchema,
  reason: z.string().trim().max(300).optional(),
});
export const TransferStudentSchema = z
  .object({
    fromBatchId: z.uuid(),
    toBatchId: z.uuid(),
    /** First day in the new batch; the old enrolment ends the day before. */
    date: CalendarDateSchema,
    weekdays: WeekdaysSchema.default([]),
    confirmOverCapacity: z.boolean().default(false),
  })
  .refine((t) => t.fromBatchId !== t.toBatchId, { message: 'same_batch', path: ['toBatchId'] });
