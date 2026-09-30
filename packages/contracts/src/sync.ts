import { z } from 'zod';

import { ErrorCodeSchema } from './errors.js';
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
