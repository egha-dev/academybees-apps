'use client';

import { liveQuery } from 'dexie';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import type { Connectivity, ConnectivityMonitor } from '../connectivity.js';
import type { QueueCounts, SyncQueue } from '../queue.js';

/** Live connection state (ARCHITECTURE §11.6). */
export function useConnectivity(monitor: ConnectivityMonitor): Connectivity {
  return useSyncExternalStore(
    useCallback((onChange: () => void) => monitor.subscribe(onChange), [monitor]),
    () => monitor.current,
    () => 'online',
  );
}

/** Matches the SyncIndicator states in @academybee/ui. */
export type SyncIndicatorState = 'synced' | 'offline' | 'pending' | 'syncing' | 'attention';

export type SyncStatus = {
  counts: QueueCounts;
  lastSyncedAt: number | null;
  state: SyncIndicatorState;
  /** Failed + conflict: shown as "needs attention" until the user resolves them. */
  attention: number;
};

const EMPTY: QueueCounts = { pending: 0, processing: 0, failed: 0, conflict: 0, synced: 0 };

export function deriveSyncState(
  counts: QueueCounts,
  connectivity: Connectivity,
): SyncIndicatorState {
  if (counts.failed + counts.conflict > 0) return 'attention';
  if (connectivity === 'offline') return 'offline';
  if (counts.processing > 0) return 'syncing';
  if (counts.pending > 0) return 'pending';
  return 'synced';
}

/**
 * Pending count, last successful sync and failures for every shell (CLAUDE.md §11). Updates
 * live from IndexedDB, including changes made by other tabs.
 */
export function useSyncStatus(queue: SyncQueue, connectivity: Connectivity): SyncStatus {
  const [data, setData] = useState<{ counts: QueueCounts; lastSyncedAt: number | null }>({
    counts: EMPTY,
    lastSyncedAt: null,
  });

  useEffect(() => {
    const subscription = liveQuery(async () => ({
      counts: await queue.counts(),
      lastSyncedAt: await queue.lastSyncedAt(),
    })).subscribe({ next: setData, error: () => undefined });
    return () => subscription.unsubscribe();
  }, [queue]);

  return {
    ...data,
    attention: data.counts.failed + data.counts.conflict,
    state: deriveSyncState(data.counts, connectivity),
  };
}

/**
 * Logout guard (ARCHITECTURE §11.6): if anything is unsynced, the UI must ask before signing
 * out (default action: stay). `unsynced` is live; `mustConfirm` says whether to show the dialog.
 */
export function useLogoutGuard(queue: SyncQueue): { unsynced: number; mustConfirm: boolean } {
  const [unsynced, setUnsynced] = useState(0);
  useEffect(() => {
    const subscription = liveQuery(() => queue.unsyncedCount()).subscribe({
      next: setUnsynced,
      error: () => undefined,
    });
    return () => subscription.unsubscribe();
  }, [queue]);
  return { unsynced, mustConfirm: unsynced > 0 };
}
