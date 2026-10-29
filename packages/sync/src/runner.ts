import type { SyncOp, SyncOpResult, SyncPushResponse } from '@academybee/contracts';

import type { ConnectivityMonitor } from './connectivity.js';
import type { SyncQueue } from './queue.js';

/** Sends a batch to `POST /api/v1/sync/push` (the endpoint arrives in Phase 6). */
export type SyncTransport = (ops: SyncOp[]) => Promise<SyncPushResponse>;

/** Thrown by the transport so the runner can classify failures. */
export class SyncTransportError extends Error {
  constructor(
    readonly kind: 'network' | 'server' | 'rate_limited' | 'unauthenticated',
    message: string = kind,
  ) {
    super(message);
    this.name = 'SyncTransportError';
  }
}

/** The subset of the Web Locks API the runner needs (injectable for tests / old browsers). */
export type LockLike = {
  request<T>(
    name: string,
    options: { ifAvailable: true },
    cb: (lock: unknown) => Promise<T>,
  ): Promise<T>;
};

export const SYNC_LOCK_NAME = 'academybee-sync';

/** Fallback when navigator.locks is missing: a per-page mutex (still no double runs in one tab). */
export function createLocalLocks(): LockLike {
  const held = new Set<string>();
  return {
    async request(name, _options, cb) {
      if (held.has(name)) return cb(null);
      held.add(name);
      try {
        return await cb({});
      } finally {
        held.delete(name);
      }
    },
  };
}

export type RunOutcome =
  'done' | 'skipped_locked' | 'skipped_offline' | 'paused_auth' | 'retry_scheduled';

export type RunnerOptions = {
  queue: SyncQueue;
  transport: SyncTransport;
  connectivity?: ConnectivityMonitor;
  locks?: LockLike;
  batchSize?: number;
  /** Called when the server needs the user to sign in again; ops stay queued. */
  onAuthRequired?: () => void;
  /** Called with each definitive result after the queue has recorded it (local rows follow). */
  onResult?: (result: SyncOpResult) => Promise<void>;
  /** Called after each run so UI can refresh (in addition to Dexie live queries). */
  onRunComplete?: (outcome: RunOutcome) => void;
  debounceMs?: number;
  intervalMs?: number;
  target?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;
};

/**
 * Sync runner (ARCHITECTURE §11.4). Triggers: start, back online, tab visible, after enqueue
 * (debounced 1 s), and every 60 s while ops are pending — never the Background Sync API (iOS).
 * A Web Lock ensures one tab runs at a time; others skip.
 */
export class SyncRunner {
  private readonly locks: LockLike;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private interval: ReturnType<typeof setInterval> | undefined;
  private unsubscribe: (() => void) | undefined;
  private paused = false;

  constructor(private readonly options: RunnerOptions) {
    const nav = typeof navigator === 'undefined' ? undefined : (navigator as { locks?: LockLike });
    this.locks = options.locks ?? nav?.locks ?? createLocalLocks();
  }

  start(): Promise<void> {
    this.unsubscribe = this.options.connectivity?.subscribe((state) => {
      if (state === 'online') void this.run();
    });
    const doc = this.options.target ?? (typeof document === 'undefined' ? undefined : document);
    doc?.addEventListener('visibilitychange', this.onVisibility);
    this.interval = setInterval(() => {
      void this.options.queue.counts().then((c) => {
        if (c.pending > 0) void this.run();
      });
    }, this.options.intervalMs ?? 60_000);
    void this.run();
    return Promise.resolve();
  }

  stop(): void {
    this.unsubscribe?.();
    const doc = this.options.target ?? (typeof document === 'undefined' ? undefined : document);
    doc?.removeEventListener('visibilitychange', this.onVisibility);
    clearInterval(this.interval);
    clearTimeout(this.debounce);
  }

  /** Call after enqueueing; runs after a short debounce so bursts go in one push. */
  schedule(): void {
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.run(), this.options.debounceMs ?? 1_000);
  }

  /** Resume after the user signs in again. */
  resume(): void {
    this.paused = false;
    void this.run();
  }

  /** One sync pass under the cross-tab lock. */
  async run(): Promise<RunOutcome> {
    const outcome = await this.locks.request(
      SYNC_LOCK_NAME,
      { ifAvailable: true },
      async (lock) => {
        if (!lock) return 'skipped_locked' as const;
        return this.drain();
      },
    );
    this.options.onRunComplete?.(outcome);
    return outcome;
  }

  private readonly onVisibility = () => {
    const doc = this.options.target ?? document;
    if (doc.visibilityState === 'visible') void this.run();
  };

  private async drain(): Promise<RunOutcome> {
    const { queue, transport, connectivity } = this.options;
    if (this.paused) return 'paused_auth';
    if (connectivity && connectivity.current === 'offline') return 'skipped_offline';
    // Only the lock holder marks ops "processing", and its last pass has ended: anything still
    // processing was left by a closed tab or app. Recovering here, under the lock, never takes
    // ops from a tab that is sending them.
    await queue.recoverInterrupted();

    for (;;) {
      const batch = await queue.nextBatch(this.options.batchSize ?? 100);
      if (batch.length === 0) return 'done';
      const opIds = batch.map((i) => i.opId);
      await queue.markProcessing(opIds);
      const ops: SyncOp[] = batch.map(
        ({
          opId,
          type,
          entityKey,
          payload,
          baseVersion,
          clientCreatedAt,
          deviceId,
          schemaVersion,
        }) => ({
          opId,
          type,
          entityKey,
          payload,
          ...(baseVersion !== undefined ? { baseVersion } : {}),
          clientCreatedAt,
          deviceId,
          schemaVersion,
        }),
      );

      let response: SyncPushResponse;
      try {
        response = await transport(ops);
      } catch (error) {
        if (error instanceof SyncTransportError && error.kind === 'unauthenticated') {
          await queue.requeue(opIds);
          this.paused = true;
          this.options.onAuthRequired?.();
          return 'paused_auth';
        }
        const code =
          error instanceof SyncTransportError && error.kind === 'rate_limited'
            ? 'RATE_LIMITED'
            : 'NETWORK';
        await queue.markRetry(opIds, {
          code,
          message: error instanceof Error ? error.message : String(error),
        });
        if (error instanceof SyncTransportError && error.kind === 'network')
          void connectivity?.check();
        return 'retry_scheduled';
      }

      const answered = new Set<string>();
      try {
        for (const result of response.results) {
          if (!opIds.includes(result.opId)) continue;
          await queue.applyResult(result);
          await this.options.onResult?.(result);
          answered.add(result.opId);
        }
      } catch (error) {
        // Storing an answer failed: send those ops again; the server answers DUPLICATE with the
        // same result, so nothing is applied twice and nothing is left "processing".
        await queue.markRetry(
          opIds.filter((id) => !answered.has(id)),
          { code: 'INTERNAL', message: error instanceof Error ? error.message : String(error) },
        );
        return 'retry_scheduled';
      }
      // Anything the server didn't answer stays queued and is retried — never assumed done.
      const unanswered = opIds.filter((id) => !answered.has(id));
      if (unanswered.length > 0) {
        await queue.markRetry(unanswered, { code: 'INTERNAL', message: 'no result from server' });
        return 'retry_scheduled';
      }
    }
  }
}
