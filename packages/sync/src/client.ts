import {
  type AttendanceMarkInput,
  type AttendanceStatus,
  AttendanceOpConflictSchema,
  AttendanceOpDataSchema,
  MarkSessionOpSchema,
  SYNC_SCHEMA_VERSION,
  type SyncOp,
  type SyncOpResult,
  SyncPushResponseSchema,
  type SyncSnapshot,
  SyncSnapshotSchema,
} from '@academybee/contracts';

import { type AcademyBeeDB, attendanceKey, type LocalAttendance, wipeLocalData } from './db.js';
import type { SyncQueue } from './queue.js';
import { type SyncTransport, SyncTransportError } from './runner.js';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type SyncClientOptions = {
  db: AcademyBeeDB;
  queue: SyncQueue;
  /** Same-origin API base, e.g. `/api/v1`. */
  apiBase?: string;
  fetch?: FetchLike;
  /** The CSRF token for state-changing requests (double-submit cookie). */
  csrf?: () => string | undefined;
  /** Access ended (`MEMBERSHIP_REVOKED`): local data has been wiped; send the user away. */
  onRevoked?: () => void;
  /** A request that hasn't answered by then counts as a lost connection (default 30 s). */
  timeoutMs?: number;
  now?: () => number;
};

export type PullOutcome = 'ok' | 'offline' | 'auth' | 'revoked' | 'error';

/** A mark the user sets on the attendance screen. */
export type MarkInput = { studentId: string; status: AttendanceStatus; note?: string | null };

/** Per conflicting student: keep this device's value, or take the other person's. */
export type ConflictChoice = 'mine' | 'theirs';

/**
 * The device side of offline sync (ADR-016, ARCHITECTURE §11.3): talks to `/sync/*`, keeps the
 * working set in Dexie, turns a roll call into a queued op (shown at once, marked pending), and
 * applies each server result to the local rows. The runner sends; this decides what the rows say.
 */
export class SyncClient {
  private readonly apiBase: string;
  private readonly fetch: FetchLike;
  private readonly now: () => number;
  private readonly timeoutMs: number;

  constructor(private readonly options: SyncClientOptions) {
    this.apiBase = options.apiBase ?? '/api/v1';
    this.fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  private get db() {
    return this.options.db;
  }

  /** The runner's transport: `POST /sync/push`, failures classified for retry or sign-in. */
  readonly transport: SyncTransport = async (ops: SyncOp[]) => {
    let res: Response;
    try {
      res = await this.fetch(`${this.apiBase}/sync/push`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', ...this.csrfHeader() },
        body: JSON.stringify({ ops }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new SyncTransportError('network', error instanceof Error ? error.message : 'network');
    }
    if (res.status === 401) {
      if ((await this.errorCode(res)) === 'MEMBERSHIP_REVOKED') await this.revoked();
      throw new SyncTransportError('unauthenticated');
    }
    if (res.status === 429) throw new SyncTransportError('rate_limited');
    if (!res.ok) throw new SyncTransportError('server', `HTTP ${res.status}`);
    // An answer that isn't a valid push response is a server failure: the ops are retried.
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new SyncTransportError('server', 'unreadable response');
    }
    const parsed = SyncPushResponseSchema.safeParse(body);
    if (!parsed.success) throw new SyncTransportError('server', 'malformed response');
    return parsed.data;
  };

  private csrfHeader(): Record<string, string> {
    const token = this.options.csrf?.();
    return token ? { 'x-csrf-token': token } : {};
  }

  private async errorCode(res: Response): Promise<string | undefined> {
    try {
      const body = (await res.json()) as { error?: { code?: string } };
      return body.error?.code;
    } catch {
      return undefined;
    }
  }

  private async revoked() {
    await wipeLocalData(this.db);
    this.options.onRevoked?.();
  }

  /** The watermark from the last pull, if any. */
  async watermark(): Promise<string | null> {
    const entry = await this.db.meta.get('watermark');
    return typeof entry?.value === 'string' ? entry.value : null;
  }

  /** Fetch the working set: everything on first use, changes afterwards. */
  async pull(): Promise<PullOutcome> {
    const since = await this.watermark();
    const path = since
      ? `${this.apiBase}/sync/pull?since=${encodeURIComponent(since)}`
      : `${this.apiBase}/sync/bootstrap`;
    let res: Response;
    try {
      res = await this.fetch(path, {
        credentials: 'same-origin',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      return 'offline';
    }
    if (res.status === 401) {
      if ((await this.errorCode(res)) === 'MEMBERSHIP_REVOKED') {
        await this.revoked();
        return 'revoked';
      }
      return 'auth';
    }
    if (!res.ok) return 'error';
    await this.applySnapshot(SyncSnapshotSchema.parse(await res.json()));
    return 'ok';
  }

  /**
   * Store a snapshot. The working set is replaced whole (what is missing is gone); marks the
   * server sent replace synced local marks, but never a value this device still has to send.
   */
  async applySnapshot(snap: SyncSnapshot): Promise<void> {
    const db = this.db;
    await db.transaction(
      'rw',
      [db.batches, db.students, db.enrolments, db.sessions, db.attendance, db.meta],
      async () => {
        await Promise.all([
          db.batches.clear(),
          db.students.clear(),
          db.enrolments.clear(),
          db.sessions.clear(),
        ]);
        await db.batches.bulkPut(snap.batches);
        await db.students.bulkPut(snap.students);
        await db.enrolments.bulkPut(snap.enrolments);
        await db.sessions.bulkPut(snap.sessions);
        if (snap.attendanceComplete)
          await db.attendance.where('syncState').equals('synced').delete();
        for (const row of snap.attendance) {
          const key = attendanceKey(row.sessionId, row.studentId);
          const local = await db.attendance.get(key);
          if (local && local.syncState !== 'synced') {
            // Keep the unsent value; remember the server's id and version as the new base.
            await db.attendance.update(key, { id: row.id, serverVersion: row.version });
            continue;
          }
          await db.attendance.put({
            key,
            id: row.id,
            sessionId: row.sessionId,
            studentId: row.studentId,
            status: row.status,
            note: row.note,
            serverVersion: row.version,
            syncState: 'synced',
            opId: null,
            updatedAt: this.now(),
          });
        }
        await db.meta.bulkPut([
          { key: 'watermark', value: snap.watermark },
          { key: 'window', value: snap.window },
          { key: 'lastPullAt', value: this.now() },
        ]);
      },
    );
  }

  /**
   * Save a roll call (C-126, C-131): the marks show at once on this device ("pending") and one
   * op goes to the queue with each student's last server version as its base.
   */
  async markSession(
    sessionId: string,
    marks: MarkInput[],
    bases: Record<string, number | undefined> = {},
  ): Promise<string> {
    const db = this.db;
    return db.transaction('rw', [db.attendance, db.syncQueue, db.syncLog], async () => {
      const keys = marks.map((m) => attendanceKey(sessionId, m.studentId));
      const current = await db.attendance.bulkGet(keys);
      const payloadMarks: AttendanceMarkInput[] = marks.map((m, i) => {
        const base = m.studentId in bases ? bases[m.studentId] : current[i]?.serverVersion;
        return {
          studentId: m.studentId,
          status: m.status,
          ...(m.note !== undefined ? { note: m.note } : {}),
          ...(base ? { baseVersion: base } : {}),
        };
      });
      const opId = await this.options.queue.enqueue({
        type: 'attendance.markSession',
        entityKey: `session:${sessionId}`,
        payload: { sessionId, marks: payloadMarks },
        schemaVersion: SYNC_SCHEMA_VERSION,
      });
      await db.attendance.bulkPut(
        marks.map((m, i) => ({
          key: keys[i]!,
          id: current[i]?.id ?? null,
          sessionId,
          studentId: m.studentId,
          status: m.status,
          note: m.note !== undefined ? m.note : (current[i]?.note ?? null),
          serverVersion: current[i]?.serverVersion ?? null,
          syncState: 'pending' as const,
          opId,
          updatedAt: this.now(),
        })),
      );
      return opId;
    });
  }

  /** Apply one definitive server result to the local marks (wired as the runner's `onResult`). */
  readonly onResult = async (result: SyncOpResult): Promise<void> => {
    const db = this.db;
    const item = await db.syncQueue.get(result.opId);
    const payload = MarkSessionOpSchema.safeParse(item?.payload);
    if (!item || !payload.success) return;
    const { sessionId } = payload.data;
    const mine = async (studentId: string) => {
      const row = await db.attendance.get(attendanceKey(sessionId, studentId));
      // A newer local change for this student rides on a later op: leave it pending.
      return row && row.opId === result.opId ? row : undefined;
    };
    await db.transaction('rw', db.attendance, async () => {
      if (result.status === 'APPLIED' || result.status === 'DUPLICATE') {
        const data = AttendanceOpDataSchema.safeParse(result.data);
        for (const mark of data.success ? data.data.marks : []) {
          const key = attendanceKey(sessionId, mark.studentId);
          await db.attendance.update(key, (r) => {
            r.id = mark.id;
            r.serverVersion = mark.version;
            if (r.opId !== result.opId) return; // a newer local change stays pending
            r.syncState = 'synced';
            r.opId = null;
            delete r.errorCode;
            delete r.conflictServer;
          });
        }
        return;
      }
      if (result.status === 'CONFLICT') {
        const conflicts = AttendanceOpConflictSchema.safeParse(result.conflict?.server);
        for (const c of conflicts.success ? conflicts.data : []) {
          const row = await mine(c.studentId);
          if (row)
            await db.attendance.update(row.key, {
              syncState: 'conflict',
              conflictServer: {
                status: c.server.status,
                note: c.server.note,
                version: c.server.version,
                markedByName: c.server.markedByName,
              },
            });
        }
        return;
      }
      for (const m of payload.data.marks) {
        const row = await mine(m.studentId);
        if (row)
          await db.attendance.update(row.key, {
            syncState: 'failed',
            errorCode: result.error?.code ?? 'REJECTED',
          });
      }
    });
  };

  /**
   * Resolve a conflict (ADR-017, C-126): per conflicting student keep this device's value (sent
   * again on top of the other person's version) or take theirs. The old op is discarded only
   * here, after the user chose — never silently.
   */
  async resolveConflict(
    opId: string,
    choices: Record<string, ConflictChoice>,
  ): Promise<string | null> {
    const db = this.db;
    const item = await db.syncQueue.get(opId);
    const payload = MarkSessionOpSchema.safeParse(item?.payload);
    const conflicts = AttendanceOpConflictSchema.safeParse(item?.conflict?.server);
    if (!item || item.status !== 'conflict' || !payload.success || !conflicts.success)
      throw new Error('not a conflict');
    const server = new Map(conflicts.data.map((c) => [c.studentId, c.server]));
    const resend: MarkInput[] = [];
    const bases: Record<string, number | undefined> = {};
    for (const m of payload.data.marks) {
      const theirs = server.get(m.studentId);
      if (theirs && (choices[m.studentId] ?? 'mine') === 'theirs') {
        await db.attendance.put({
          key: attendanceKey(payload.data.sessionId, m.studentId),
          id: theirs.id,
          sessionId: payload.data.sessionId,
          studentId: m.studentId,
          status: theirs.status,
          note: theirs.note,
          serverVersion: theirs.version,
          syncState: 'synced',
          opId: null,
          updatedAt: this.now(),
        });
        continue;
      }
      resend.push({
        studentId: m.studentId,
        status: m.status,
        ...(m.note !== undefined ? { note: m.note } : {}),
      });
      bases[m.studentId] = theirs ? theirs.version : m.baseVersion;
    }
    // Queue the new op before dropping the old one, so the device never looks synced in between.
    const next = resend.length
      ? await this.markSession(payload.data.sessionId, resend, bases)
      : null;
    await this.options.queue.discard(opId);
    await this.countResolved(choices, [...server.keys()]);
    return next;
  }

  /** Tally conflict choices for the next beacon (analytics, counts only). */
  private async countResolved(choices: Record<string, ConflictChoice>, students: string[]) {
    const theirs = students.filter((id) => choices[id] === 'theirs').length;
    const prev = await this.resolvedSinceBeacon();
    await this.db.meta.put({
      key: 'resolved',
      value: { mine: prev.mine + students.length - theirs, theirs: prev.theirs + theirs },
    });
  }

  /** Conflict choices not yet reported by a beacon. */
  async resolvedSinceBeacon(): Promise<{ mine: number; theirs: number }> {
    const value = (await this.db.meta.get('resolved'))?.value as
      { mine: number; theirs: number } | undefined;
    return value ?? { mine: 0, theirs: 0 };
  }

  /** The user's data stays only while signed in: ask the browser not to evict it. */
  static async requestPersistence(): Promise<boolean | null> {
    const storage = (globalThis.navigator as Navigator | undefined)?.storage;
    if (!storage?.persist) return null;
    try {
      return (await storage.persisted()) || (await storage.persist());
    } catch {
      return null;
    }
  }

  /** For the Sync Center: the local rows an op carries. */
  async rowsOf(opId: string): Promise<LocalAttendance[]> {
    return this.db.attendance.where('opId').equals(opId).toArray();
  }
}
