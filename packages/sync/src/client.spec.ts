import { newId, type SyncOpResult, type SyncSnapshot } from '@academybee/contracts';
import { Dexie } from 'dexie';
import { describe, expect, it, vi } from 'vitest';

import { type FetchLike, SyncClient } from './client.js';
import { AcademyBeeDB, attendanceKey } from './db.js';
import { LocalData } from './local.js';
import { SyncQueue } from './queue.js';
import { SyncTransportError } from './runner.js';
import { createTestQueue } from './test/helpers.js';

const BATCH = newId();
const SESSION = newId();
const [S1, S2, S3] = [newId(), newId(), newId()];

/** A snapshot like the server's: one batch meeting today, three students (S3 only on Mondays). */
function snapshot(over: Partial<SyncSnapshot> = {}): SyncSnapshot {
  return {
    watermark: '2026-10-19T05:00:00.000Z',
    window: { from: '2026-10-12', to: '2026-11-02' },
    batches: [{ id: BATCH, name: 'Karate Mon/Wed/Fri', courseName: 'Karate', status: 'ACTIVE' }],
    enrolments: [S1, S2, S3].map((studentId, i) => ({
      id: newId(),
      batchId: BATCH,
      studentId,
      startedOn: '2026-09-01',
      endedOn: null,
      weekdays: i === 2 ? [1] : [],
    })),
    students: [
      { id: S1, fullName: 'Asha', admissionNo: 'A1', status: 'ACTIVE' },
      { id: S2, fullName: 'Bala', admissionNo: 'A2', status: 'ACTIVE' },
      { id: S3, fullName: 'Chitra', admissionNo: 'A3', status: 'ACTIVE' },
    ],
    sessions: [
      {
        id: SESSION,
        batchId: BATCH,
        date: '2026-10-21', // a Wednesday
        start: '18:00',
        end: '19:00',
        startsAt: '2026-10-21T12:30:00.000Z',
        endsAt: '2026-10-21T13:30:00.000Z',
        status: 'SCHEDULED',
        teacherName: 'Tara',
        holidayName: null,
      },
    ],
    attendance: [],
    attendanceComplete: true,
    ...over,
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function setup(fetchImpl?: FetchLike) {
  const { db, queue } = createTestQueue();
  const fetch = vi.fn(fetchImpl ?? (() => Promise.resolve(json(200, snapshot()))));
  const onRevoked = vi.fn();
  const client = new SyncClient({ db, queue, fetch, csrf: () => 'csrf-1', onRevoked });
  return { db, queue, client, fetch, onRevoked, local: new LocalData(db) };
}

describe('Dexie v2 (C-125)', () => {
  it('upgrades a v1 database and keeps queued ops', async () => {
    const name = `v1-${newId()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({
      meta: 'key',
      syncQueue: 'opId, status, createdAt, [status+createdAt], entityKey',
      syncLog: '++seq, opId, at',
    });
    await v1
      .table('syncQueue')
      .add({ opId: 'op-1', status: 'pending', entityKey: 'session:x', createdAt: 1 });
    v1.close();
    const db = new AcademyBeeDB(name);
    expect((await db.syncQueue.get('op-1'))?.status).toBe('pending');
    expect(await db.attendance.count()).toBe(0);
    db.close();
  });
});

describe('SyncClient', () => {
  it('bootstraps first, then pulls since the watermark', async () => {
    const { client, fetch, local } = setup();
    expect(await client.pull()).toBe('ok');
    expect(fetch.mock.calls[0]![0]).toBe('/api/v1/sync/bootstrap');
    expect(await client.pull()).toBe('ok');
    expect(fetch.mock.calls[1]![0]).toBe(
      `/api/v1/sync/pull?since=${encodeURIComponent('2026-10-19T05:00:00.000Z')}`,
    );
    expect(await local.ready()).toBe(true);
  });

  it('the roll follows day plans; marks show at once as pending and queue one op with bases', async () => {
    const { client, local, queue, db } = setup();
    await client.applySnapshot(
      snapshot({
        attendance: [
          {
            id: newId(),
            sessionId: SESSION,
            studentId: S1,
            status: 'ABSENT',
            note: null,
            version: 2,
            markedAt: '2026-10-21T12:40:00.000Z',
            updatedAt: '2026-10-21T12:40:00.000Z',
          },
        ],
      }),
    );
    const roll = await local.roll(SESSION);
    // Chitra only comes on Mondays; the class is on a Wednesday.
    expect(roll.map((r) => [r.student.fullName, r.expected])).toEqual([
      ['Asha', true],
      ['Bala', true],
    ]);
    const opId = await client.markSession(SESSION, [
      { studentId: S1, status: 'PRESENT' },
      { studentId: S2, status: 'LATE' },
    ]);
    const item = await queue.get(opId);
    expect(item?.payload).toEqual({
      sessionId: SESSION,
      marks: [
        { studentId: S1, status: 'PRESENT', baseVersion: 2 },
        { studentId: S2, status: 'LATE' },
      ],
    });
    expect(item?.schemaVersion).toBe(2);
    const rows = await db.attendance.where('sessionId').equals(SESSION).toArray();
    expect(rows.map((r) => [r.studentId, r.status, r.syncState])).toEqual(
      expect.arrayContaining([
        [S1, 'PRESENT', 'pending'],
        [S2, 'LATE', 'pending'],
      ]),
    );
  });

  it('a pull never overwrites a value still waiting to be sent', async () => {
    const { client, db } = setup();
    await client.applySnapshot(snapshot());
    await client.markSession(SESSION, [{ studentId: S1, status: 'ABSENT' }]);
    const serverId = newId();
    await client.applySnapshot(
      snapshot({
        attendanceComplete: false,
        attendance: [
          {
            id: serverId,
            sessionId: SESSION,
            studentId: S1,
            status: 'PRESENT',
            note: null,
            version: 4,
            markedAt: '2026-10-21T12:40:00.000Z',
            updatedAt: '2026-10-21T12:40:00.000Z',
          },
        ],
      }),
    );
    expect(await db.attendance.get(attendanceKey(SESSION, S1))).toMatchObject({
      status: 'ABSENT',
      syncState: 'pending',
      id: serverId,
      serverVersion: 4,
    });
  });

  it('results: applied takes the server version; rejected and conflict stay visible', async () => {
    const { client, queue, db } = setup();
    await client.applySnapshot(snapshot());
    const ok = await client.markSession(SESSION, [{ studentId: S1, status: 'PRESENT' }]);
    const applied: SyncOpResult = {
      opId: ok,
      status: 'APPLIED',
      data: { marks: [{ studentId: S1, id: newId(), version: 1 }] },
    };
    await queue.applyResult(applied);
    await client.onResult(applied);
    expect(await db.attendance.get(attendanceKey(SESSION, S1))).toMatchObject({
      syncState: 'synced',
      serverVersion: 1,
      opId: null,
    });

    const bad = await client.markSession(SESSION, [{ studentId: S2, status: 'ABSENT' }]);
    await client.onResult({
      opId: bad,
      status: 'REJECTED',
      error: { code: 'INVALID_STATE_TRANSITION', message: 'window_closed' },
    });
    expect(await db.attendance.get(attendanceKey(SESSION, S2))).toMatchObject({
      syncState: 'failed',
      errorCode: 'INVALID_STATE_TRANSITION',
      status: 'ABSENT',
    });
  });

  it('Try again sends a refused roll call as a new op, keeping when it was made (P6-4 M2)', async () => {
    const { client, queue, db } = setup();
    await client.applySnapshot(snapshot());
    const bad = await client.markSession(SESSION, [{ studentId: S2, status: 'ABSENT' }]);
    const refused: SyncOpResult = {
      opId: bad,
      status: 'REJECTED',
      error: { code: 'NOT_FOUND', message: 'not_found' },
    };
    await queue.applyResult(refused);
    await client.onResult(refused);
    const madeAt = (await queue.get(bad))!.clientCreatedAt;
    const next = await client.retryRefused(bad);
    expect(next).not.toBe(bad);
    expect(await queue.get(bad)).toBeUndefined();
    expect(await queue.get(next)).toMatchObject({ status: 'pending', clientCreatedAt: madeAt });
    expect(await db.attendance.get(attendanceKey(SESSION, S2))).toMatchObject({
      status: 'ABSENT',
      syncState: 'pending',
      opId: next,
    });
  });

  it('Discard drops the change; a mark the academy held comes back with the next pull (M3)', async () => {
    const { client, queue, db } = setup();
    const serverId = newId();
    await client.applySnapshot(
      snapshot({
        attendance: [
          {
            id: serverId,
            sessionId: SESSION,
            studentId: S1,
            status: 'PRESENT',
            note: null,
            version: 2,
            markedAt: '2026-10-21T12:40:00.000Z',
            updatedAt: '2026-10-21T12:40:00.000Z',
          },
        ],
      }),
    );
    const op = await client.markSession(SESSION, [{ studentId: S1, status: 'ABSENT' }]);
    await client.discardChange(op);
    expect(await queue.get(op)).toBeUndefined();
    expect(await db.attendance.get(attendanceKey(SESSION, S1))).toBeUndefined();
    // No watermark: the next pull is a full download, which brings back PRESENT.
    expect(await client.watermark()).toBeNull();
  });

  it('a conflict is resolved per student: keep mine resends on their version, theirs takes it', async () => {
    const { client, queue, db } = setup();
    await client.applySnapshot(snapshot());
    const opId = await client.markSession(SESSION, [
      { studentId: S1, status: 'PRESENT' },
      { studentId: S2, status: 'PRESENT' },
    ]);
    const server = (studentId: string, status: 'ABSENT' | 'LATE', version: number) => ({
      studentId,
      server: {
        id: newId(),
        status,
        note: null,
        version,
        markedAt: '2026-10-21T12:41:00.000Z',
        markedByName: 'Owner',
      },
    });
    const conflict: SyncOpResult = {
      opId,
      status: 'CONFLICT',
      conflict: { server: [server(S1, 'ABSENT', 3), server(S2, 'LATE', 5)] },
    };
    await queue.applyResult(conflict);
    await client.onResult(conflict);
    expect((await db.attendance.get(attendanceKey(SESSION, S1)))?.syncState).toBe('conflict');
    expect((await db.attendance.get(attendanceKey(SESSION, S1)))?.conflictServer?.status).toBe(
      'ABSENT',
    );

    const next = await client.resolveConflict(opId, { [S1]: 'mine', [S2]: 'theirs' });
    expect(await queue.get(opId)).toBeUndefined();
    expect((await queue.get(next!))?.payload).toEqual({
      sessionId: SESSION,
      marks: [{ studentId: S1, status: 'PRESENT', baseVersion: 3 }],
    });
    expect(await db.attendance.get(attendanceKey(SESSION, S2))).toMatchObject({
      status: 'LATE',
      syncState: 'synced',
      serverVersion: 5,
    });
    // Counted for the next beacon (analytics): one kept, one taken.
    expect(await client.resolvedSinceBeacon()).toEqual({ mine: 1, theirs: 1 });
  });

  it('the transport classifies failures and sends the CSRF token', async () => {
    const send = (status: number, body: unknown = {}) =>
      setup(() => Promise.resolve(json(status, body))).client.transport([]);
    await expect(send(429)).rejects.toMatchObject({ kind: 'rate_limited' });
    await expect(send(503)).rejects.toMatchObject({ kind: 'server' });
    await expect(send(401, { error: { code: 'SESSION_EXPIRED' } })).rejects.toBeInstanceOf(
      SyncTransportError,
    );
    const offline = setup(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(offline.client.transport([])).rejects.toMatchObject({ kind: 'network' });
    const ok = setup(() => Promise.resolve(json(200, { results: [] })));
    await ok.client.transport([]);
    expect(ok.fetch.mock.calls[0]![1]?.headers).toMatchObject({ 'x-csrf-token': 'csrf-1' });
  });

  it('a malformed or hung push counts as a failure to retry', async () => {
    const bad = setup(() => Promise.resolve(json(200, { results: [{ opId: 1 }] })));
    await expect(bad.client.transport([])).rejects.toMatchObject({ kind: 'server' });
    const { db, queue } = createTestQueue();
    const hung: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
      );
    const client = new SyncClient({ db, queue, fetch: hung, timeoutMs: 20 });
    await expect(client.transport([])).rejects.toMatchObject({ kind: 'network' });
    expect(await client.pull()).toBe('offline');
  });

  it('revoked access wipes this device’s data', async () => {
    const { client, db, onRevoked } = setup(() =>
      Promise.resolve(json(401, { error: { code: 'MEMBERSHIP_REVOKED' } })),
    );
    await db.meta.put({ key: 'watermark', value: 'x' });
    expect(await client.pull()).toBe('revoked');
    expect(onRevoked).toHaveBeenCalledOnce();
    expect(await Dexie.exists(db.name)).toBe(false);
  });

  it('offline pulls change nothing', async () => {
    const { client } = setup(() => Promise.reject(new TypeError('offline')));
    expect(await client.pull()).toBe('offline');
  });
});

describe('the runner hands results to the client', () => {
  it('calls onResult after the queue records each result', async () => {
    const { SyncRunner } = await import('./runner.js');
    const { queue, db } = createTestQueue();
    const client = new SyncClient({ db, queue, fetch: () => Promise.reject(new Error('unused')) });
    await client.applySnapshot(snapshot());
    const opId = await client.markSession(SESSION, [{ studentId: S1, status: 'PRESENT' }]);
    const runner = new SyncRunner({
      queue,
      transport: () =>
        Promise.resolve({
          results: [
            {
              opId,
              status: 'APPLIED',
              data: { marks: [{ studentId: S1, id: newId(), version: 1 }] },
            },
          ],
        }),
      onResult: client.onResult,
    });
    expect(await runner.run()).toBe('done');
    expect((await db.attendance.get(attendanceKey(SESSION, S1)))?.syncState).toBe('synced');
    expect(await new SyncQueue(db, { deviceId: 'd' }).unsyncedCount()).toBe(0);
  });
});
