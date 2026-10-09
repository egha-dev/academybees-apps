import type { ErrorCode, SyncLocalStatus, SyncOp } from '@academybee/contracts';
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

/**
 * AcademyBee local database (ADR-016, ARCHITECTURE §11.2): one per origin (= academy) + user.
 * Every schema change is a new explicit `version(n)`; never edit a released version.
 * v1 (Phase 0): meta, syncQueue, syncLog. Domain tables arrive as v2+ with their phases
 * (Phase 6 attendance/sessions, Phase 7 invoices/pending cash, Phase 9 drafts).
 */
export class AcademyBeeDB extends Dexie {
  meta!: EntityTable<MetaEntry, 'key'>;
  syncQueue!: EntityTable<SyncQueueItem, 'opId'>;
  syncLog!: EntityTable<SyncLogEntry, 'seq'>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      meta: 'key',
      syncQueue: 'opId, status, createdAt, [status+createdAt], entityKey',
      syncLog: '++seq, opId, at',
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

/** Logout / membership revocation: remove every local record for this user (ARCHITECTURE §11.7). */
export async function wipeLocalData(db: AcademyBeeDB): Promise<void> {
  db.close();
  await Dexie.delete(db.name);
}
