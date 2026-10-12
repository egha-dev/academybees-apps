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

// ── Weekly pattern (C-113, C-121) ─────────────────────────────────────────────────────────

/** `HH:MM`, 24-hour. */
export const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const SlotInputSchema = z
  .object({
    weekday: WeekdaySchema,
    start: TimeSchema,
    end: TimeSchema,
    /** Who teaches this slot; default: the batch's primary teacher. */
    teacherId: z.uuid().nullable().optional(),
  })
  .refine((s) => s.end > s.start, { message: 'end_before_start', path: ['end'] });

/** `PUT /batches/:id/schedule`: the full weekly pattern from a date (default today). */
export const SaveScheduleSchema = z
  .object({
    from: CalendarDateSchema.optional(),
    slots: z.array(SlotInputSchema).max(14),
  })
  .superRefine((v, ctx) => {
    v.slots.forEach((a, i) =>
      v.slots.forEach((b, j) => {
        if (j > i && a.weekday === b.weekday && a.start < b.end && b.start < a.end)
          ctx.addIssue({
            code: 'custom',
            message: 'overlapping_slots',
            path: ['slots', j, 'start'],
          });
      }),
    );
  });

export const WeeklySlotSchema = z.object({
  id: z.uuid(),
  weekday: WeekdaySchema,
  start: z.string(),
  end: z.string(),
  teacherId: z.uuid().nullable(),
  teacherName: z.string().nullable(),
  effectiveFrom: z.string(),
});

// ── Class sessions ────────────────────────────────────────────────────────────────────────

export const SESSION_STATUSES = ['SCHEDULED', 'CANCELLED', 'COMPLETED'] as const;
export const SESSION_CANCEL_REASONS = ['TEACHER_UNAVAILABLE', 'HOLIDAY', 'OTHER'] as const;

export const SessionSchema = z.object({
  id: z.uuid(),
  batchId: z.uuid(),
  batchName: z.string(),
  courseName: z.string(),
  branchId: z.uuid(),
  teacherId: z.uuid().nullable(),
  teacherName: z.string().nullable(),
  /** Academy-local date and times. */
  date: z.string(),
  start: z.string(),
  end: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.enum(SESSION_STATUSES),
  origin: z.enum(['GENERATED', 'MANUAL']),
  cancelReason: z.enum(SESSION_CANCEL_REASONS).nullable(),
  holidayName: z.string().nullable(),
  makeupForSessionId: z.uuid().nullable(),
  /** Changed by staff, so weekly-pattern edits leave it alone (C-113). */
  changed: z.boolean(),
  note: z.string().nullable(),
  version: z.number().int(),
});
export type Session = z.infer<typeof SessionSchema>;

/** Another class the same teacher has at an overlapping time (a warning, not a refusal). */
export const DoubleBookingSchema = z.object({
  sessionId: z.uuid(),
  teacherName: z.string(),
  date: z.string(),
  start: z.string(),
  end: z.string(),
  otherBatchName: z.string(),
});
export const SessionResultSchema = z.object({
  session: SessionSchema,
  doubleBookings: z.array(DoubleBookingSchema),
});

export const ScheduleSchema = z.object({
  slots: z.array(WeeklySlotSchema),
  upcoming: z.array(SessionSchema),
  doubleBookings: z.array(DoubleBookingSchema),
  /** Students whose day plan includes a day the batch no longer meets (C-120): staff decide. */
  plansOutside: z.array(
    z.object({ enrolmentId: z.uuid(), studentName: z.string(), weekdays: z.array(WeekdaySchema) }),
  ),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

export const HolidaySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  kind: z.enum(['HOLIDAY', 'CLOSURE']),
  branchId: z.uuid().nullable(),
  removedAt: z.string().nullable(),
  cancelledSessions: z.number().int(),
});
export type Holiday = z.infer<typeof HolidaySchema>;

export const SessionsQuerySchema = z
  .object({
    from: CalendarDateSchema,
    to: CalendarDateSchema,
    batchId: z.uuid().optional(),
    teacherId: z.uuid().optional(),
    courseId: z.uuid().optional(),
    branchId: z.uuid().optional(),
  })
  .refine((q) => q.to >= q.from, { message: 'to_before_from', path: ['to'] })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= 31, {
    message: 'range_too_long',
    path: ['to'],
  });
export const SessionListSchema = z.object({
  from: z.string(),
  to: z.string(),
  today: z.string(),
  items: z.array(SessionSchema),
  holidays: z.array(HolidaySchema),
});

const SessionTimes = { date: CalendarDateSchema, start: TimeSchema, end: TimeSchema };
/** `POST /sessions`: an extra class, or a make-up for a cancelled one (C-115). */
export const CreateSessionSchema = z
  .object({
    batchId: z.uuid(),
    ...SessionTimes,
    teacherId: z.uuid().nullable().optional(),
    makeupForSessionId: z.uuid().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((s) => s.end > s.start, { message: 'end_before_start', path: ['end'] });
/** `PATCH /sessions/:id`: move it, change the teacher, add a note (sets "changed"). */
export const UpdateSessionSchema = z
  .object({
    version: Version,
    date: CalendarDateSchema.optional(),
    start: TimeSchema.optional(),
    end: TimeSchema.optional(),
    teacherId: z.uuid().nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((s) => !s.start || !s.end || s.end > s.start, {
    message: 'end_before_start',
    path: ['end'],
  });
export const CancelSessionSchema = z.object({
  version: Version,
  reason: z.enum(['TEACHER_UNAVAILABLE', 'OTHER']),
  note: z.string().trim().max(500).optional(),
});
export const RestoreSessionSchema = z.object({ version: Version });

// ── Holidays (G-03, C-114, C-115) ─────────────────────────────────────────────────────────

/** Most classes one holiday may cancel in one go. */
export const HOLIDAY_MAX_SESSIONS = 2000;

export const HolidayInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    startDate: CalendarDateSchema,
    endDate: CalendarDateSchema,
    kind: z.enum(['HOLIDAY', 'CLOSURE']).default('HOLIDAY'),
    /** Omit for every branch. */
    branchId: z.uuid().nullable().optional(),
  })
  .refine((h) => h.endDate >= h.startDate, { message: 'ends_before_start', path: ['endDate'] })
  .refine((h) => (Date.parse(h.endDate) - Date.parse(h.startDate)) / 86_400_000 <= 366, {
    message: 'range_too_long',
    path: ['endDate'],
  });
export const HolidayPreviewSchema = z.object({
  days: z.array(
    z.object({
      date: z.string(),
      sessions: z.array(
        z.object({ id: z.uuid(), batchName: z.string(), start: z.string(), end: z.string() }),
      ),
      students: z.number().int(),
    }),
  ),
  totals: z.object({
    sessions: z.number().int(),
    batches: z.number().int(),
    students: z.number().int(),
  }),
});
export const HolidayCreatedSchema = z.object({
  holiday: HolidaySchema,
  cancelled: z.number().int(),
  /** Parent notices recorded (one per expected child), delivered from Phase 6 (C-114). */
  notices: z.number().int(),
});
export const HolidayListSchema = z.object({ items: z.array(HolidaySchema) });
export const HolidayListQuerySchema = z.object({
  from: CalendarDateSchema.optional(),
  includeRemoved: z.coerce.boolean().default(false),
});
