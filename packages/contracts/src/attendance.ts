import { z } from 'zod';

import { CalendarDateSchema } from './students.js';

/**
 * Attendance (Phase 6; ADR-017, C-126, C-130). One mark per class and student; `version` drives
 * the conflict rule. Percentages count Present and Late as attended and leave out Leave
 * (an informed absence), so a month with only leave days has no percentage.
 */
export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE'] as const;
export const AttendanceStatusSchema = z.enum(ATTENDANCE_STATUSES);
export type AttendanceStatus = z.infer<typeof AttendanceStatusSchema>;

const Note = z.string().trim().max(500);

/** One student's mark as the client proposes it. No `baseVersion` = the client had no mark. */
export const AttendanceMarkInputSchema = z.object({
  studentId: z.uuid(),
  status: AttendanceStatusSchema,
  note: Note.nullable().optional(),
  baseVersion: z.number().int().min(1).optional(),
});
export type AttendanceMarkInput = z.infer<typeof AttendanceMarkInputSchema>;

/** `PUT /sessions/:id/attendance` and the `attendance.markSession` sync op (C-126: atomic). */
export const MarkSessionInputSchema = z
  .object({ marks: z.array(AttendanceMarkInputSchema).min(1).max(500) })
  .refine((v) => new Set(v.marks.map((m) => m.studentId)).size === v.marks.length, {
    message: 'duplicate_student',
    path: ['marks'],
  });
export type MarkSessionInput = z.infer<typeof MarkSessionInputSchema>;

/** `PATCH /attendance/:id`: correct one mark. */
export const UpdateAttendanceInputSchema = z.object({
  version: z.number().int().min(1),
  status: AttendanceStatusSchema,
  note: Note.nullable().optional(),
});

export const AttendanceMarkSchema = z.object({
  id: z.uuid(),
  status: AttendanceStatusSchema,
  note: z.string().nullable(),
  version: z.number().int(),
  markedAt: z.string(),
  markedByName: z.string().nullable(),
});
export type AttendanceMark = z.infer<typeof AttendanceMarkSchema>;

/** Why a roll call can't be changed now (C-129, C-130). */
export const ATTENDANCE_LOCKS = ['cancelled', 'not_yet', 'window_closed'] as const;

export const AttendanceCountsSchema = z.object({
  PRESENT: z.number().int(),
  ABSENT: z.number().int(),
  LATE: z.number().int(),
  LEAVE: z.number().int(),
  unmarked: z.number().int(),
});
export type AttendanceCounts = z.infer<typeof AttendanceCountsSchema>;

/** `GET /sessions/:id/attendance`: the roll call for one class. */
export const SessionAttendanceSchema = z.object({
  session: z.object({
    id: z.uuid(),
    batchId: z.uuid(),
    batchName: z.string(),
    date: z.string(),
    start: z.string(),
    end: z.string(),
    startsAt: z.string(),
    endsAt: z.string(),
    status: z.enum(['SCHEDULED', 'CANCELLED', 'COMPLETED']),
    teacherName: z.string().nullable(),
  }),
  /** Null when the caller may change it now; otherwise why not. */
  locked: z.enum(ATTENDANCE_LOCKS).nullable(),
  /** Until when a teacher may still change it (48 h after the class, C-130). */
  editableUntil: z.string().nullable(),
  students: z.array(
    z.object({
      studentId: z.uuid(),
      fullName: z.string(),
      admissionNo: z.string().nullable(),
      /** On the roll for this day (enrolled, and the day is in their day plan, C-120). */
      expected: z.boolean(),
      attendance: AttendanceMarkSchema.nullable(),
    }),
  ),
  counts: AttendanceCountsSchema,
});
export type SessionAttendance = z.infer<typeof SessionAttendanceSchema>;

/** A mark someone else changed since the client's base (ADR-017): shown so the user chooses. */
export const AttendanceConflictSchema = z.object({
  studentId: z.uuid(),
  server: AttendanceMarkSchema,
});
export type AttendanceConflict = z.infer<typeof AttendanceConflictSchema>;

/** `GET /students/:id/attendance`: monthly percentages and recent marks. */
export const StudentAttendanceSchema = z.object({
  months: z.array(
    z.object({
      month: z.string(),
      present: z.number().int(),
      absent: z.number().int(),
      late: z.number().int(),
      leave: z.number().int(),
      /** (present + late) / (marked − leave), 0–100; null when nothing counts. */
      percent: z.number().nullable(),
    }),
  ),
  items: z.array(
    z.object({
      id: z.uuid(),
      sessionId: z.uuid(),
      batchId: z.uuid(),
      batchName: z.string(),
      date: z.string(),
      status: AttendanceStatusSchema,
      note: z.string().nullable(),
    }),
  ),
});
export const StudentAttendanceQuerySchema = z.object({
  /** Months back from this one, including it (default 6). */
  months: z.coerce.number().int().min(1).max(24).default(6),
});

/** `GET /batches/:id/attendance`: classes in a range with their counts. */
export const BatchAttendanceQuerySchema = z
  .object({ from: CalendarDateSchema, to: CalendarDateSchema })
  .refine((q) => q.to >= q.from, { message: 'to_before_from', path: ['to'] })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= 92, {
    message: 'range_too_long',
    path: ['to'],
  });
export const BatchAttendanceSchema = z.object({
  sessions: z.array(
    z.object({
      sessionId: z.uuid(),
      date: z.string(),
      start: z.string(),
      status: z.enum(['SCHEDULED', 'CANCELLED', 'COMPLETED']),
      counts: AttendanceCountsSchema,
    }),
  ),
  percent: z.number().nullable(),
});

/** `GET /attendance/overview?date=`: today's roll calls by batch (Owner Today, G-16). */
export const AttendanceOverviewQuerySchema = z.object({ date: CalendarDateSchema.optional() });
export const AttendanceOverviewSchema = z.object({
  date: z.string(),
  sessions: z.array(
    z.object({
      sessionId: z.uuid(),
      batchId: z.uuid(),
      batchName: z.string(),
      start: z.string(),
      end: z.string(),
      endsAt: z.string(),
      teacherName: z.string().nullable(),
      /** taken: a roll call is saved; due: the class has ended without one; later: not ended yet. */
      state: z.enum(['taken', 'due', 'later', 'cancelled']),
      counts: AttendanceCountsSchema,
    }),
  ),
  totals: z.object({ taken: z.number().int(), due: z.number().int(), later: z.number().int() }),
});
