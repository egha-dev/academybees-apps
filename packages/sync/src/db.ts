import type {
  AttendanceStatus,
  ErrorCode,
  SyncAttendance,
  SyncBatch,
  SyncEnrolment,
  SyncLocalStatus,
  SyncOp,
  SyncSession,
  SyncStudent,
} from '@academybee/contracts';
import { Dexie, type EntityTable } from 'dexie';

/** A sync op plus its local-only queue state (ARCHITECTURE §11.3). */
export type SyncQueueItem = SyncOp & {
  status: SyncLocalStatus;
  /** Epoch ms, for display ("Saved 2 minutes ago") and ordering ties. */
  createdAt: number;
  attempts: number;
  /** Epoch ms before which the runner must not retry. */
  nextAttemptAt: number;
  lastError?: { code: ErrorCode | 'NETWORK'; message: string };
  /** Server version after APPLIED/DUPLICATE. */
  serverVersion?: number;
  /** Server-side value shown when resolving a CONFLICT. */
  conflict?: { server: unknown };
  syncedAt?: number;
};

export type SyncLogEntry = {
  seq?: number;
  opId: string;
  at: number;
  event:
    | 'enqueued'
    | 'sending'
    | 'applied'
    | 'duplicate'
    | 'rejected'
    | 'conflict'
    | 'retry'
    | 'recovered'
    | 'requeued'
    | 'discarded'
    | 'purged';
  detail?: string;
};

export type MetaEntry = { key: string; value: unknown };

export type LocalBatch = SyncBatch;
export type LocalStudent = SyncStudent;
export type LocalEnrolment = SyncEnrolment;
export type LocalSession = SyncSession;
export type ServerAttendance = SyncAttendance;

/**
 * A mark on this device (C-126). Keyed by class and student (`key`), because a mark saved offline
 * has no server id yet. `serverVersion` is the version last seen from the server: the base for
 * the next op. `syncState` says whether the shown value still has to reach the server.
 */
export type LocalAttendance = {
  key: string;
  id: string | null;
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  note: string | null;
  serverVersion: number | null;
  syncState: 'synced' | 'pending' | 'conflict' | 'failed';
  /** The op that carries the shown value, while it is not synced. */
  opId: string | null;
  /** The other person's value when the server reported a conflict. */
  conflictServer?: {
    status: AttendanceStatus;
    note: string | null;
    version: number;
    markedByName: string | null;
  };
  errorCode?: string;
  updatedAt: number;
};

export type LocalNotification = {
  id: string;
  kind: string;
  params: Record<string, unknown>;
  link: string | null;
  createdAt: string;
  readAt: string | null;
};

export const attendanceKey = (sessionId: string, studentId: string) => `${sessionId}:${studentId}`;

/**
 * AcademyBee local database (ADR-016, ARCHITECTURE §11.2): one per origin (= academy) + user.
 * Every schema change is a new explicit `version(n)`; never edit a released version.
 * v1 (Phase 0): meta, syncQueue, syncLog. v2 (Phase 6): batches, students, enrolments,
 * sessions, attendance, notifications. Phase 7 adds invoices/pending cash, Phase 9 drafts.
 */
export class AcademyBeeDB extends Dexie {
  meta!: EntityTable<MetaEntry, 'key'>;
  syncQueue!: EntityTable<SyncQueueItem, 'opId'>;
  syncLog!: EntityTable<SyncLogEntry, 'seq'>;
  batches!: EntityTable<LocalBatch, 'id'>;
  students!: EntityTable<LocalStudent, 'id'>;
  enrolments!: EntityTable<LocalEnrolment, 'id'>;
  sessions!: EntityTable<LocalSession, 'id'>;
  attendance!: EntityTable<LocalAttendance, 'key'>;
  notifications!: EntityTable<LocalNotification, 'id'>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      meta: 'key',
      syncQueue: 'opId, status, createdAt, [status+createdAt], entityKey',
      syncLog: '++seq, opId, at',
    });
    // v2 (Phase 6, C-125): the teacher's working set and their marks. Earlier tables are kept.
    this.version(2).stores({
      batches: 'id',
      students: 'id',
      enrolments: 'id, batchId, studentId',
      sessions: 'id, date, batchId, [date+batchId], status',
      attendance: 'key, sessionId, studentId, syncState, opId',
      notifications: 'id, createdAt, readAt',
    });
  }
}

/** Database name for a signed-in user (the origin already separates academies). */
export function databaseName(userId: string): string {
  return `ab_${userId}`;
}

export function openAcademyBeeDB(userId: string): AcademyBeeDB {
  return new AcademyBeeDB(databaseName(userId));
}

/** Service worker caches that hold signed-in app shells (C-124); wiped with local data. */
export const SHELL_CACHES = ['ab-teach-shell'];

/**
 * Logout / membership revocation: remove every local record for this user, and the cached app
 * shells (ARCHITECTURE §11.7).
 */
export async function wipeLocalData(db: AcademyBeeDB): Promise<void> {
  db.close();
  await Dexie.delete(db.name);
  const caches = (globalThis as { caches?: CacheStorage }).caches;
  if (caches) await Promise.all(SHELL_CACHES.map((name) => caches.delete(name)));
}
