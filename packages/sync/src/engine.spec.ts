import { newId } from '@academybee/contracts';
import { describe, expect, it, vi } from 'vitest';

import { ConnectivityMonitor } from './connectivity.js';
import { SyncEngine } from './engine.js';

const snapshot = {
  watermark: '2026-10-19T05:00:00.000Z',
  window: { from: '2026-10-12', to: '2026-11-02' },
  batches: [],
  enrolments: [],
  students: [],
  sessions: [],
  attendance: [],
  attendanceComplete: true,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('SyncEngine', () => {
  it('pulls on start and again when the connection comes back; the beacon sends counts only', async () => {
    const fetch = vi.fn((url: string, _init?: RequestInit) =>
      Promise.resolve(
        url.includes('beacon') ? new Response(null, { status: 204 }) : json(snapshot),
      ),
    );
    const target = Object.assign(new EventTarget(), { navigator: { onLine: true } });
    const connectivity = new ConnectivityMonitor({
      fetchFn: () => Promise.resolve(new Response('{}')),
      target: target as never,
      heartbeatIntervalMs: 60_000,
    });
    const engine = new SyncEngine({
      userId: `u-${newId()}`,
      deviceId: 'device-1',
      fetch,
      connectivity,
      csrf: () => 't',
    });
    await engine.start();
    expect(fetch.mock.calls.map((c) => c[0])).toContain('/api/v1/sync/bootstrap');
    expect(await engine.local.ready()).toBe(true);

    target.navigator.onLine = false;
    target.dispatchEvent(new Event('offline'));
    target.navigator.onLine = true;
    target.dispatchEvent(new Event('online'));
    await vi.waitFor(() =>
      expect(
        fetch.mock.calls.some((c) => String(c[0]).startsWith('/api/v1/sync/pull?since=')),
      ).toBe(true),
    );

    await engine.beacon();
    const beacon = fetch.mock.calls.find((c) => String(c[0]).endsWith('/sync/beacon'));
    expect(JSON.parse(beacon![1]!.body as string)).toEqual({
      pending: 0,
      failed: 0,
      conflicts: 0,
      oldestPendingAgeSec: null,
      storagePersisted: null,
    });
    engine.stop();
  });
});
