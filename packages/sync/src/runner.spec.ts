import type { SyncOp, SyncPushResponse } from '@academybee/contracts';
import { describe, expect, it, vi } from 'vitest';

import { ConnectivityMonitor } from './connectivity.js';
import { createLocalLocks, SyncRunner, SyncTransportError } from './runner.js';
import { createTestQueue, markSession } from './test/helpers.js';

const applyAll = (ops: SyncOp[]): Promise<SyncPushResponse> =>
  Promise.resolve({
    results: ops.map((o) => ({ opId: o.opId, status: 'APPLIED' as const, serverVersion: 1 })),
  });

describe('SyncRunner', () => {
  it('only one runner holds the lock at a time (exit gate)', async () => {
    const { queue } = createTestQueue();
    await queue.enqueue(markSession('A'));
    const locks = createLocalLocks(); // shared, like navigator.locks across tabs
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const transport = vi.fn(async (ops: SyncOp[]) => {
      await gate;
      return applyAll(ops);
    });
    const tab1 = new SyncRunner({ queue, transport, locks });
    const tab2 = new SyncRunner({ queue, transport, locks });

    const first = tab1.run();
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    expect(await tab2.run()).toBe('skipped_locked');
    release();
    expect(await first).toBe('done');
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await queue.counts()).toMatchObject({ synced: 1, pending: 0 });
  });

  it('applies results per op and keeps going until the queue is drained', async () => {
    const { queue } = createTestQueue();
    for (let i = 0; i < 5; i++) await queue.enqueue(markSession(`S${i}`));
    const transport = vi.fn(applyAll);
    expect(
      await new SyncRunner({ queue, transport, batchSize: 2, locks: createLocalLocks() }).run(),
    ).toBe('done');
    expect(transport).toHaveBeenCalledTimes(3);
    expect((await queue.counts()).synced).toBe(5);
  });

  it('schedules a retry on network failure and never drops the op', async () => {
    const { queue } = createTestQueue();
    const a = await queue.enqueue(markSession('A'));
    const transport = vi.fn().mockRejectedValue(new SyncTransportError('network', 'fetch failed'));
    expect(await new SyncRunner({ queue, transport, locks: createLocalLocks() }).run()).toBe(
      'retry_scheduled',
    );
    expect(await queue.get(a)).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastError: { code: 'NETWORK' },
    });
  });

  it('pauses on 401 without counting attempts, and resumes after sign-in', async () => {
    const { queue } = createTestQueue();
    const a = await queue.enqueue(markSession('A'));
    const onAuthRequired = vi.fn();
    const transport = vi
      .fn()
      .mockRejectedValueOnce(new SyncTransportError('unauthenticated'))
      .mockImplementation(applyAll);
    const runner = new SyncRunner({ queue, transport, onAuthRequired, locks: createLocalLocks() });
    expect(await runner.run()).toBe('paused_auth');
    expect(onAuthRequired).toHaveBeenCalledOnce();
    expect(await queue.get(a)).toMatchObject({ status: 'pending', attempts: 0 });
    expect(await runner.run()).toBe('paused_auth');
    runner.resume();
    await vi.waitFor(async () => expect((await queue.get(a))?.status).toBe('synced'));
  });

  it('retries ops the server did not answer instead of assuming success', async () => {
    const { queue } = createTestQueue();
    const a = await queue.enqueue(markSession('A'));
    const b = await queue.enqueue(markSession('B'));
    const transport = vi.fn().mockResolvedValue({ results: [{ opId: a, status: 'APPLIED' }] });
    expect(await new SyncRunner({ queue, transport, locks: createLocalLocks() }).run()).toBe(
      'retry_scheduled',
    );
    expect(await queue.get(b)).toMatchObject({ status: 'pending', attempts: 1 });
  });

  it('does not send while offline', async () => {
    const { queue } = createTestQueue();
    await queue.enqueue(markSession('A'));
    const connectivity = new ConnectivityMonitor({
      fetchFn: vi.fn().mockRejectedValue(new Error('down')),
    });
    await connectivity.check();
    const transport = vi.fn(applyAll);
    expect(
      await new SyncRunner({ queue, transport, connectivity, locks: createLocalLocks() }).run(),
    ).toBe('skipped_offline');
    expect(transport).not.toHaveBeenCalled();
  });

  it('recovers interrupted ops on start', async () => {
    const { queue } = createTestQueue();
    const a = await queue.enqueue(markSession('A'));
    await queue.markProcessing([a]);
    const runner = new SyncRunner({
      queue,
      transport: applyAll,
      locks: createLocalLocks(),
      intervalMs: 60_000,
    });
    await runner.start();
    await vi.waitFor(async () => expect((await queue.get(a))?.status).toBe('synced'));
    runner.stop();
  });
});

describe('ConnectivityMonitor', () => {
  it('trusts the heartbeat over navigator.onLine and notifies changes', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockRejectedValueOnce(new Error('x'));
    const monitor = new ConnectivityMonitor({ fetchFn });
    const seen: string[] = [];
    monitor.subscribe((s) => seen.push(s));
    expect(await monitor.check()).toBe('online');
    expect(await monitor.check()).toBe('offline');
    expect(seen).toEqual(['offline']);
    expect(fetchFn).toHaveBeenCalledWith(
      '/api/v1/health/live',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('goes offline immediately on the browser offline signal', async () => {
    const target = new EventTarget() as unknown as Window;
    Object.assign(target, { navigator: { onLine: false } });
    const monitor = new ConnectivityMonitor({ fetchFn: vi.fn(), target });
    expect(monitor.current).toBe('offline');
    expect(await monitor.check()).toBe('offline');
  });
});
