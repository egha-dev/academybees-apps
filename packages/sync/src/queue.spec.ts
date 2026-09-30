import { describe, expect, it } from 'vitest';

import { AcademyBeeDB, databaseName, wipeLocalData } from './db.js';
import { SyncQueue } from './queue.js';
import { createTestQueue, markSession } from './test/helpers.js';

describe('SyncQueue persistence (exit gate)', () => {
  it('keeps queued ops across a database close/reopen (simulated restart)', async () => {
    const { name, db, queue } = createTestQueue();
    const a = await queue.enqueue(markSession('s1', ['st1']));
    const b = await queue.enqueue(markSession('s2'));
    await queue.markProcessing([b]); // the app dies mid-send
    db.close();

    const reopened = new AcademyBeeDB(name);
    const after = new SyncQueue(reopened, { deviceId: 'device-1' });
    expect(await after.recoverInterrupted()).toBe(1);
    const items = await after.list();
    expect(items.map((i) => [i.opId, i.status])).toEqual([
      [a, 'pending'],
      [b, 'pending'],
    ]);
    expect(items[0]!.payload).toEqual({ present: ['st1'] });
    reopened.close();
  });

  it('validates ops against the shared contract', async () => {
    const { queue } = createTestQueue();
    await expect(queue.enqueue({ ...markSession('s1'), entityKey: '' })).rejects.toThrow();
  });

  it('names the database per user and wipes it on logout', async () => {
    expect(databaseName('u1')).toBe('ab_u1');
    const { name, db, queue } = createTestQueue();
    await queue.enqueue(markSession('s1'));
    await wipeLocalData(db);
    const fresh = new AcademyBeeDB(name);
    expect(await fresh.syncQueue.count()).toBe(0);
    fresh.close();
  });
});

describe('SyncQueue ordering and blocking (exit gate)', () => {
  it('holds later ops for an entityKey behind a conflict, while other keys continue', async () => {
    const { queue } = createTestQueue();
    const a1 = await queue.enqueue(markSession('A'));
    const a2 = await queue.enqueue(markSession('A', ['x']));
    const b1 = await queue.enqueue(markSession('B'));

    expect((await queue.nextBatch()).map((i) => i.opId)).toEqual([a1, a2, b1]);

    await queue.markProcessing([a1, a2, b1]);
    await queue.applyResult({
      opId: a1,
      status: 'CONFLICT',
      conflict: { server: { present: [] } },
    });
    await queue.requeue([a2, b1]);
    const a3 = await queue.enqueue(markSession('A', ['y']));
    const b2 = await queue.enqueue(markSession('B', ['z']));

    expect((await queue.nextBatch()).map((i) => i.opId)).toEqual([b1, b2]);
    expect(await queue.get(a3)).toMatchObject({ status: 'pending' });

    await queue.retryNow(a1);
    expect((await queue.nextBatch()).map((i) => i.opId)).toEqual([a1, a2, b1, a3, b2]);
  });

  it('holds later ops behind a REJECTED op and behind one waiting for its retry time', async () => {
    const { queue, clock } = createTestQueue();
    const a1 = await queue.enqueue(markSession('A'));
    const a2 = await queue.enqueue(markSession('A'));
    await queue.markRetry([a1], { code: 'NETWORK', message: 'offline' });
    expect(await queue.nextBatch()).toEqual([]);

    clock.now += 2_000;
    expect((await queue.nextBatch()).map((i) => i.opId)).toEqual([a1, a2]);

    await queue.applyResult({
      opId: a1,
      status: 'REJECTED',
      error: { code: 'FORBIDDEN', message: 'no' },
    });
    expect(await queue.nextBatch()).toEqual([]);
    expect(await queue.get(a1)).toMatchObject({
      status: 'failed',
      lastError: { code: 'FORBIDDEN' },
    });
  });
});

describe('SyncQueue results and bookkeeping', () => {
  it('marks APPLIED/DUPLICATE as synced and records the last sync time', async () => {
    const { queue, clock } = createTestQueue();
    const a = await queue.enqueue(markSession('A'));
    const b = await queue.enqueue(markSession('B'));
    await queue.applyResult({ opId: a, status: 'APPLIED', serverVersion: 4 });
    await queue.applyResult({ opId: b, status: 'DUPLICATE' });
    expect(await queue.get(a)).toMatchObject({
      status: 'synced',
      serverVersion: 4,
      syncedAt: clock.now,
    });
    expect(await queue.counts()).toEqual({
      pending: 0,
      processing: 0,
      failed: 0,
      conflict: 0,
      synced: 2,
    });
    expect(await queue.lastSyncedAt()).toBe(clock.now);
    expect(await queue.unsyncedCount()).toBe(0);
  });

  it('backs off retries with attempts counted, requeue does not count', async () => {
    const { queue, clock } = createTestQueue();
    const a = await queue.enqueue(markSession('A'));
    await queue.markRetry([a], { code: 'NETWORK', message: 'x' });
    await queue.markRetry([a], { code: 'NETWORK', message: 'x' });
    expect(await queue.get(a)).toMatchObject({ attempts: 2, nextAttemptAt: clock.now + 2_000 });
    await queue.requeue([a]);
    expect((await queue.get(a))!.attempts).toBe(2);
  });

  it('only removes an op when the user explicitly discards it, and logs it', async () => {
    const { queue, db } = createTestQueue();
    const a = await queue.enqueue(markSession('A'));
    await queue.discard(a);
    expect(await queue.get(a)).toBeUndefined();
    const log = await db.syncLog.where('opId').equals(a).toArray();
    expect(log.map((l) => l.event)).toEqual(['enqueued', 'discarded']);
  });

  it('purges synced items after the retention window only', async () => {
    const { queue, clock } = createTestQueue();
    const a = await queue.enqueue(markSession('A'));
    const b = await queue.enqueue(markSession('B'));
    await queue.applyResult({ opId: a, status: 'APPLIED' });
    clock.now += 8 * 24 * 60 * 60 * 1000;
    expect(await queue.purgeSynced()).toBe(1);
    expect(await queue.get(a)).toBeUndefined();
    expect(await queue.get(b)).toMatchObject({ status: 'pending' });
  });
});
