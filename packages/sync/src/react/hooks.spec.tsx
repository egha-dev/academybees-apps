import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConnectivityMonitor } from '../connectivity.js';
import { createTestQueue, markSession } from '../test/helpers.js';
import { deriveSyncState, useConnectivity, useLogoutGuard, useSyncStatus } from './hooks.js';

describe('deriveSyncState', () => {
  const zero = { pending: 0, processing: 0, failed: 0, conflict: 0, synced: 0 };
  it.each([
    [{ ...zero }, 'online', 'synced'],
    [{ ...zero, pending: 3 }, 'online', 'pending'],
    [{ ...zero, processing: 1 }, 'online', 'syncing'],
    [{ ...zero, pending: 3 }, 'offline', 'offline'],
    [{ ...zero, conflict: 1 }, 'offline', 'attention'],
  ] as const)('%j + %s → %s', (counts, conn, state) => {
    expect(deriveSyncState(counts, conn)).toBe(state);
  });
});

describe('hooks', () => {
  it('useSyncStatus follows the queue live', async () => {
    const { queue } = createTestQueue();
    const { result } = renderHook(() => useSyncStatus(queue, 'online'));
    expect(result.current.state).toBe('synced');
    let opId = '';
    await act(async () => {
      opId = await queue.enqueue(markSession('A'));
    });
    await waitFor(() => expect(result.current.counts.pending).toBe(1));
    expect(result.current.state).toBe('pending');
    await act(async () => {
      await queue.applyResult({ opId, status: 'APPLIED' });
    });
    await waitFor(() => expect(result.current.state).toBe('synced'));
    expect(result.current.lastSyncedAt).not.toBeNull();
  });

  it('useLogoutGuard requires confirmation while anything is unsynced', async () => {
    const { queue } = createTestQueue();
    const { result } = renderHook(() => useLogoutGuard(queue));
    expect(result.current.mustConfirm).toBe(false);
    await act(async () => {
      await queue.enqueue(markSession('A'));
    });
    await waitFor(() => expect(result.current).toEqual({ unsynced: 1, mustConfirm: true }));
  });

  it('useConnectivity re-renders on changes', async () => {
    const monitor = new ConnectivityMonitor({
      fetchFn: vi.fn().mockRejectedValue(new Error('down')),
    });
    const { result } = renderHook(() => useConnectivity(monitor));
    expect(result.current).toBe('online');
    await act(async () => {
      await monitor.check();
    });
    expect(result.current).toBe('offline');
  });
});
