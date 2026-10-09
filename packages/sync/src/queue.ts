import {
  type ErrorCode,
  newId,
  type SyncOp,
  type SyncOpResult,
  SyncOpSchema,
  type SyncOpType,
} from '@academybee/contracts';

import { backoffDelay } from './backoff.js';
import type { AcademyBeeDB, SyncLogEntry, SyncQueueItem } from './db.js';

export type EnqueueInput = {
  type: SyncOpType;
  entityKey: string;
  payload: unknown;
  baseVersion?: number;
  schemaVersion?: number;
};

export type QueueCounts = {
  pending: number;
  processing: number;
  failed: number;
  conflict: number;
  synced: number;
};

export type QueueOptions = {
  deviceId: string;
  now?: () => number;
  random?: () => number;
  /** Synced items are kept briefly for the Sync Center history (ARCHITECTURE §11.4). */
  syncedRetentionMs?: number;
};

const LOG_CAP = 500;
const DEFAULT_RETENTION = 7 * 24 * 60 * 60 * 1000;

/**
 * Durable offline operation queue (ADR-016). Every write goes through here — even online — so
 * there is one code path. Items survive restarts (IndexedDB), retry with backoff, end in a
 * definitive state, and are never dropped silently: only an explicit `discard()` removes one.
 */
export class SyncQueue {
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(
    readonly db: AcademyBeeDB,
    private readonly options: QueueOptions,
  ) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  /** Add an operation; validated against the shared op contract. Returns the opId. */
  async enqueue(input: EnqueueInput): Promise<string> {
    const op: SyncOp = SyncOpSchema.parse({
      opId: newId(),
      type: input.type,
      entityKey: input.entityKey,
      payload: input.payload,
      ...(input.baseVersion !== undefined ? { baseVersion: input.baseVersion } : {}),
      clientCreatedAt: new Date(this.now()).toISOString(),
      deviceId: this.options.deviceId,
      schemaVersion: input.schemaVersion ?? 1,
    });
    const now = this.now();
    await this.db.transaction('rw', this.db.syncQueue, this.db.syncLog, async () => {
      await this.db.syncQueue.add({
        ...op,
        status: 'pending',
        createdAt: now,
        attempts: 0,
        nextAttemptAt: now,
      });
      await this.log(op.opId, 'enqueued');
    });
    return op.opId;
  }

  /** All items in creation order (UUIDv7 opIds sort by time). */
  list(): Promise<SyncQueueItem[]> {
    return this.db.syncQueue.orderBy('opId').toArray();
  }

  get(opId: string): Promise<SyncQueueItem | undefined> {
    return this.db.syncQueue.get(opId);
  }

  /**
   * The next ops the runner may send, in order. Ops sharing an `entityKey` are strictly
   * ordered: an earlier op that is in flight, waiting for its retry time, failed or in conflict
   * holds every later op for that key (BLOCKED) — other keys continue.
   */
  async nextBatch(max = 100): Promise<SyncQueueItem[]> {
    const now = this.now();
    const blocked = new Set<string>();
    const batch: SyncQueueItem[] = [];
    for (const item of await this.list()) {
      if (item.status === 'synced') continue;
      if (blocked.has(item.entityKey)) continue;
      if (item.status !== 'pending' || item.nextAttemptAt > now) {
        blocked.add(item.entityKey);
        continue;
      }
      batch.push(item);
      if (batch.length >= max) break;
    }
    return batch;
  }

  async markProcessing(opIds: string[]): Promise<void> {
    await this.db.transaction('rw', this.db.syncQueue, this.db.syncLog, async () => {
      for (const opId of opIds) {
        await this.db.syncQueue.update(opId, { status: 'processing' });
        await this.log(opId, 'sending');
      }
    });
  }

  /** Apply the server's definitive result for one op. */
  async applyResult(result: SyncOpResult): Promise<void> {
    const now = this.now();
    await this.db.transaction('rw', this.db.syncQueue, this.db.syncLog, async () => {
      switch (result.status) {
        case 'APPLIED':
        case 'DUPLICATE':
          await this.db.syncQueue.update(result.opId, {
            status: 'synced',
            syncedAt: now,
            ...(result.serverVersion !== undefined ? { serverVersion: result.serverVersion } : {}),
          });
          await this.log(result.opId, result.status === 'APPLIED' ? 'applied' : 'duplicate');
          break;
        case 'CONFLICT':
          await this.db.syncQueue.update(result.opId, {
            status: 'conflict',
            ...(result.conflict ? { conflict: result.conflict } : {}),
            ...(result.error ? { lastError: result.error } : {}),
          });
          await this.log(result.opId, 'conflict');
          break;
        case 'REJECTED':
          await this.db.syncQueue.update(result.opId, {
            status: 'failed',
            lastError: result.error ?? { code: 'VALIDATION_FAILED', message: '' },
          });
          await this.log(result.opId, 'rejected', result.error?.code);
          break;
      }
    });
    if (result.status === 'APPLIED' || result.status === 'DUPLICATE') {
      await this.db.meta.put({ key: 'lastSyncedAt', value: now });
    }
  }

  /** Transient failure (network, 5xx, RATE_LIMITED): back to pending with backoff. */
  async markRetry(
    opIds: string[],
    error: { code: ErrorCode | 'NETWORK'; message: string },
  ): Promise<void> {
    const now = this.now();
    await this.db.transaction('rw', this.db.syncQueue, this.db.syncLog, async () => {
      for (const opId of opIds) {
        const item = await this.db.syncQueue.get(opId);
        if (!item) continue;
        const attempts = item.attempts + 1;
        await this.db.syncQueue.update(opId, {
          status: 'pending',
          attempts,
          nextAttemptAt: now + backoffDelay(attempts, this.random),
          lastError: error,
        });
        await this.log(opId, 'retry', `${error.code} (attempt ${attempts})`);
      }
    });
  }

  /** Sign-in needed (401): put ops back without counting an attempt; nothing is dropped. */
  async requeue(opIds: string[]): Promise<void> {
    await this.db.transaction('rw', this.db.syncQueue, this.db.syncLog, async () => {
      for (const opId of opIds) {
        await this.db.syncQueue.update(opId, { status: 'pending' });
        await this.log(opId, 'requeued');
      }
    });
  }

  /** Restart recovery: ops left "processing" by a closed tab/app go back to pending. */
  async recoverInterrupted(): Promise<number> {
    const stuck = await this.db.syncQueue.where('status').equals('processing').primaryKeys();
    await this.db.transaction('rw', this.db.syncQueue, this.db.syncLog, async () => {
      for (const opId of stuck) {
        await this.db.syncQueue.update(opId, { status: 'pending' });
        await this.log(opId, 'recovered');
      }
    });
    return stuck.length;
  }

  /** User chose "Retry" in the Sync Center for a failed or conflicting op. */
  async retryNow(opId: string): Promise<void> {
    await this.db.syncQueue.update(opId, {
      status: 'pending',
      attempts: 0,
      nextAttemptAt: this.now(),
    });
    await this.log(opId, 'requeued', 'manual retry');
  }

  /** Only after explicit user confirmation (never silent, CLAUDE.md §11). */
  async discard(opId: string): Promise<void> {
    await this.db.transaction('rw', this.db.syncQueue, this.db.syncLog, async () => {
      await this.db.syncQueue.delete(opId);
      await this.log(opId, 'discarded');
    });
  }

  async counts(): Promise<QueueCounts> {
    const counts: QueueCounts = { pending: 0, processing: 0, failed: 0, conflict: 0, synced: 0 };
    await this.db.syncQueue.each((item) => {
      counts[item.status]++;
    });
    return counts;
  }

  /** Items that would be lost if local data were wiped now (logout guard). */
  async unsyncedCount(): Promise<number> {
    const c = await this.counts();
    return c.pending + c.processing + c.failed + c.conflict;
  }

  async lastSyncedAt(): Promise<number | null> {
    const entry = await this.db.meta.get('lastSyncedAt');
    return typeof entry?.value === 'number' ? entry.value : null;
  }

  /** Remove synced items older than the retention window. */
  async purgeSynced(): Promise<number> {
    const cutoff = this.now() - (this.options.syncedRetentionMs ?? DEFAULT_RETENTION);
    const old = (await this.db.syncQueue.where('status').equals('synced').toArray()).filter(
      (i) => (i.syncedAt ?? 0) < cutoff,
    );
    await this.db.syncQueue.bulkDelete(old.map((i) => i.opId));
    return old.length;
  }

  private async log(opId: string, event: SyncLogEntry['event'], detail?: string): Promise<void> {
    await this.db.syncLog.add({ opId, at: this.now(), event, ...(detail ? { detail } : {}) });
    const count = await this.db.syncLog.count();
    if (count > LOG_CAP) {
      const excess = await this.db.syncLog
        .orderBy('seq')
        .limit(count - LOG_CAP)
        .primaryKeys();
      await this.db.syncLog.bulkDelete(excess);
    }
  }
}
