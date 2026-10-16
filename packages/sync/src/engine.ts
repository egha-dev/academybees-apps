import { SyncClient, type SyncClientOptions } from './client.js';
import { ConnectivityMonitor } from './connectivity.js';
import { type AcademyBeeDB, openAcademyBeeDB } from './db.js';
import { LocalData } from './local.js';
import { SyncQueue } from './queue.js';
import { type RunOutcome, SyncRunner } from './runner.js';

export type SyncEngineOptions = {
  userId: string;
  /** A stable id for this browser (kept in localStorage by the app; not personal data). */
  deviceId: string;
  csrf?: () => string | undefined;
  apiBase?: string;
  fetch?: SyncClientOptions['fetch'];
  connectivity?: ConnectivityMonitor;
  /** The server needs the user to sign in again; queued work stays on the device. */
  onAuthRequired?: () => void;
  /** Access ended: local data is already wiped. */
  onRevoked?: () => void;
  /** After a pull or push, so screens can refresh (Dexie live queries also update). */
  onChange?: () => void;
};

/**
 * Everything a signed-in page needs for offline work (ADR-016, ARCHITECTURE §11.4): the local
 * database, queue, client and runner, wired together. It pulls the working set on start, when the
 * connection comes back, when the tab becomes visible and after a push; the runner sends queued
 * ops on the same triggers and every 60 s while some are pending. No Background Sync API.
 */
export class SyncEngine {
  readonly db: AcademyBeeDB;
  readonly queue: SyncQueue;
  readonly client: SyncClient;
  readonly runner: SyncRunner;
  readonly local: LocalData;
  readonly connectivity: ConnectivityMonitor;
  private stopped = false;
  private pulling: Promise<unknown> | null = null;
  private unsubscribe: (() => void) | undefined;

  constructor(private readonly options: SyncEngineOptions) {
    this.db = openAcademyBeeDB(options.userId);
    this.queue = new SyncQueue(this.db, { deviceId: options.deviceId });
    this.connectivity = options.connectivity ?? new ConnectivityMonitor();
    this.client = new SyncClient({
      db: this.db,
      queue: this.queue,
      ...(options.apiBase ? { apiBase: options.apiBase } : {}),
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.csrf ? { csrf: options.csrf } : {}),
      onRevoked: () => {
        this.stop();
        options.onRevoked?.();
      },
    });
    this.runner = new SyncRunner({
      queue: this.queue,
      transport: this.client.transport,
      connectivity: this.connectivity,
      onResult: this.client.onResult,
      onRunComplete: (outcome) => this.afterRun(outcome),
      ...(options.onAuthRequired ? { onAuthRequired: options.onAuthRequired } : {}),
    });
    this.local = new LocalData(this.db);
  }

  async start(): Promise<void> {
    this.connectivity.start();
    this.unsubscribe = this.connectivity.subscribe((state) => {
      if (state === 'online') void this.pull();
    });
    document.addEventListener('visibilitychange', this.onVisible);
    await this.runner.start();
    await this.pull();
    void this.queue.purgeSynced();
  }

  stop(): void {
    this.stopped = true;
    this.runner.stop();
    this.connectivity.stop();
    this.unsubscribe?.();
    document.removeEventListener('visibilitychange', this.onVisible);
  }

  /** One pull at a time; skipped while offline. */
  pull(): Promise<unknown> {
    if (this.stopped || this.connectivity.current === 'offline') return Promise.resolve();
    this.pulling ??= this.client.pull().finally(() => {
      this.pulling = null;
      this.options.onChange?.();
    });
    return this.pulling;
  }

  /** After the user saves: send soon (debounced), then refresh. */
  schedule(): void {
    this.runner.schedule();
  }

  private readonly onVisible = () => {
    if (document.visibilityState === 'visible') void this.pull();
  };

  private afterRun(outcome: RunOutcome) {
    this.options.onChange?.();
    if (outcome === 'done') void this.pull();
  }

  /** Queue health for the server's metrics (`POST /sync/beacon`); counts only. */
  async beacon(): Promise<void> {
    const items = await this.queue.list();
    const pending = items.filter((i) => i.status === 'pending' || i.status === 'processing');
    const oldest = pending.reduce<number | null>(
      (min, i) => (min === null || i.createdAt < min ? i.createdAt : min),
      null,
    );
    const persisted = await (globalThis.navigator?.storage?.persisted?.() ?? Promise.resolve(null));
    try {
      await (this.options.fetch ?? globalThis.fetch)(
        `${this.options.apiBase ?? '/api/v1'}/sync/beacon`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/json',
            ...(this.options.csrf?.() ? { 'x-csrf-token': this.options.csrf()! } : {}),
          },
          body: JSON.stringify({
            pending: pending.length,
            failed: items.filter((i) => i.status === 'failed').length,
            conflicts: items.filter((i) => i.status === 'conflict').length,
            oldestPendingAgeSec: oldest === null ? null : Math.round((Date.now() - oldest) / 1000),
            storagePersisted: persisted,
          }),
        },
      );
    } catch {
      // Metrics only: never let a failed beacon disturb the user.
    }
  }
}
