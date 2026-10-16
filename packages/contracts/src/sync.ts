import { z } from 'zod';

import { ErrorCodeSchema } from './errors.js';
import {
  AttendanceMarkInputSchema,
  AttendanceMarkSchema,
  AttendanceStatusSchema,
  MarkSessionInputSchema,
} from './attendance.js';
import { UuidV7Schema } from './ids.js';

/**
 * Offline sync operation contract (ADR-016, ARCHITECTURE §11.3). Each op type gets its own
 * payload schema in the phase that builds it (attendance: Phase 6; cash: Phase 7 …).
 */
export const SYNC_OP_TYPES = [
  'attendance.markSession',
  'attendance.update',
  'homework.saveDraft',
  'note.upsert',
  'payment.recordCash',
] as const;
export const SyncOpTypeSchema = z.enum(SYNC_OP_TYPES);
export type SyncOpType = z.infer<typeof SyncOpTypeSchema>;

export const SYNC_PUSH_MAX_OPS = 100;

/** What the client sends. `opId` is the idempotency key. */
export const SyncOpSchema = z.object({
  opId: UuidV7Schema,
  type: SyncOpTypeSchema,
  /** Ordering key, e.g. `session:<id>`. Ops with the same key are applied in order. */
  entityKey: z.string().min(1).max(200),
  payload: z.unknown(),
  /** Server version the user edited from (optimistic concurrency). */
  baseVersion: z.number().int().nonnegative().optional(),
  /** Device time; informational only — the server uses its own clock. */
  clientCreatedAt: z.iso.datetime({ offset: true }),
  deviceId: z.string().min(1).max(100),
  schemaVersion: z.number().int().positive(),
});
export type SyncOp = z.infer<typeof SyncOpSchema>;

/** Local-only queue states (never sent to the server). */
export const SYNC_LOCAL_STATUSES = [
  'pending',
  'processing',
  'synced',
  'failed',
  'conflict',
] as const;
export const SyncLocalStatusSchema = z.enum(SYNC_LOCAL_STATUSES);
export type SyncLocalStatus = z.infer<typeof SyncLocalStatusSchema>;

/** Definitive server outcome for one op. */
export const SyncOpResultStatusSchema = z.enum(['APPLIED', 'DUPLICATE', 'REJECTED', 'CONFLICT']);
export type SyncOpResultStatus = z.infer<typeof SyncOpResultStatusSchema>;

export const SyncOpResultSchema = z.object({
  opId: UuidV7Schema,
  status: SyncOpResultStatusSchema,
  serverVersion: z.number().int().nonnegative().optional(),
  error: z.object({ code: ErrorCodeSchema, message: z.string() }).optional(),
  conflict: z.object({ server: z.unknown() }).optional(),
  /** What the op produced (e.g. the new versions of the marks it saved). */
  data: z.unknown().optional(),
});
export type SyncOpResult = z.infer<typeof SyncOpResultSchema>;

export const SyncPushRequestSchema = z.object({
  ops: z.array(SyncOpSchema).min(1).max(SYNC_PUSH_MAX_OPS),
});
export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;

export const SyncPushResponseSchema = z.object({
  results: z.array(SyncOpResultSchema),
});
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;

// ── Phase 6: op payloads, pull and bootstrap (ARCHITECTURE §11.3) ─────────────────────────

/** The local schema version clients send with each op (Dexie v2, C-125). */
export const SYNC_SCHEMA_VERSION = 2;

/** `attendance.markSession`: a class's roll call (C-126). `entityKey` = `session:<sessionId>`. */
export const MarkSessionOpSchema = z.object({ sessionId: z.uuid() }).and(MarkSessionInputSchema);
export type MarkSessionOp = z.infer<typeof MarkSessionOpSchema>;
/** `attendance.update`: one student's mark. `entityKey` = `session:<sessionId>`. */
export const UpdateAttendanceOpSchema = z.object({
  sessionId: z.uuid(),
  mark: AttendanceMarkInputSchema,
});
export type UpdateAttendanceOp = z.infer<typeof UpdateAttendanceOpSchema>;

/** `data` of an APPLIED attendance op: the marks' new versions. */
export const AttendanceOpDataSchema = z.object({
  marks: z.array(z.object({ studentId: z.uuid(), id: z.uuid(), version: z.number().int() })),
});
/** `conflict.server` of a CONFLICT attendance op: each student someone else changed. */
export const AttendanceOpConflictSchema = z.array(
  z.object({ studentId: z.uuid(), server: AttendanceMarkSchema }),
);

/** The working set a device keeps (ARCHITECTURE §11.3): small, so pulls send it whole. */
export const SyncBatchSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  courseName: z.string(),
  status: z.enum(['ACTIVE', 'ARCHIVED']),
});
export const SyncEnrolmentSchema = z.object({
  id: z.uuid(),
  batchId: z.uuid(),
  studentId: z.uuid(),
  startedOn: z.string(),
  endedOn: z.string().nullable(),
  weekdays: z.array(z.number().int()),
});
/** Basic profile only (PRD v2.1 §18.8): no contacts, no health notes. */
export const SyncStudentSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  admissionNo: z.string().nullable(),
  status: z.string(),
});
export const SyncSessionSchema = z.object({
  id: z.uuid(),
  batchId: z.uuid(),
  date: z.string(),
  start: z.string(),
  end: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.enum(['SCHEDULED', 'CANCELLED', 'COMPLETED']),
  teacherName: z.string().nullable(),
  holidayName: z.string().nullable(),
});
export const SyncAttendanceSchema = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  studentId: z.uuid(),
  status: AttendanceStatusSchema,
  note: z.string().nullable(),
  version: z.number().int(),
  markedAt: z.string(),
  updatedAt: z.string(),
});

/**
 * `GET /sync/bootstrap` and `GET /sync/pull?since=`: the whole small working set (batches,
 * enrolments, students, classes from 7 days ago to 14 ahead) every time — anything missing is
 * gone (a tombstone by absence) — plus attendance: the last 30 days on bootstrap, changes since
 * the watermark on pull. Store `watermark` and send it as the next `since`.
 */
export const SyncSnapshotSchema = z.object({
  watermark: z.string(),
  window: z.object({ from: z.string(), to: z.string() }),
  batches: z.array(SyncBatchSchema),
  enrolments: z.array(SyncEnrolmentSchema),
  students: z.array(SyncStudentSchema),
  sessions: z.array(SyncSessionSchema),
  attendance: z.array(SyncAttendanceSchema),
  /** True when attendance is a full copy (bootstrap, or a watermark too old to trust). */
  attendanceComplete: z.boolean(),
});
export type SyncSnapshot = z.infer<typeof SyncSnapshotSchema>;
export const SyncPullQuerySchema = z.object({ since: z.iso.datetime({ offset: true }) });

/** `POST /sync/beacon`: how the device's queue looks (metrics only; no personal data). */
export const SyncBeaconSchema = z.object({
  pending: z.number().int().min(0).max(100_000),
  failed: z.number().int().min(0).max(100_000),
  conflicts: z.number().int().min(0).max(100_000),
  oldestPendingAgeSec: z.number().int().min(0).max(31_536_000).nullable(),
  storagePersisted: z.boolean().nullable(),
});
