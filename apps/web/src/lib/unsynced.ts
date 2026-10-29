// Plain module (no React, no Dexie): the shell's sign-out button reads it on every page.

type Guard = {
  /** Records on this device that haven't reached the server (live; may still be loading). */
  unsynced: number;
  /** Count them now, from the database: sign-out asks this, never a value still loading. */
  count?: () => Promise<number>;
  /** Close local connections before the data is deleted. */
  release?: () => void;
};

let guard: Guard = { unsynced: 0 };
const listeners = new Set<() => void>();

/**
 * Set by the Teacher PWA while its sync engine runs (ARCHITECTURE §11.6 logout guard). Merges:
 * the engine registers `count` and `release` as soon as it exists; the status line keeps
 * `unsynced` live.
 */
export function setSignOutGuard(next: Partial<Guard>): void {
  guard = { ...guard, ...next };
  for (const listener of listeners) listener();
}

export function subscribeSignOutGuard(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function signOutGuard(): Guard {
  return guard;
}

/** Unsent marks and queued ops, as `packages/sync` stores them (Dexie v2, C-125). */
const UNSYNCED = {
  attendance: { index: 'syncState', keys: ['pending', 'conflict', 'failed'] },
  syncQueue: { index: 'status', keys: ['pending', 'processing', 'failed', 'conflict'] },
} as const;

/**
 * Count this user's unsynced records straight from IndexedDB, for pages where the Teacher PWA's
 * engine isn't running (a Manage page, a read-only Batch Workspace): sign-out must still ask
 * before deleting them. A database that doesn't exist is never created by asking.
 */
export async function countUnsynced(userId: string): Promise<number> {
  const db = await new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(`ab_${userId}`);
      req.onupgradeneeded = () => req.transaction?.abort(); // nothing stored on this device
      req.onsuccess = () => resolve(req.result);
      req.onerror = req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  if (!db) return 0;
  try {
    const counts = await Promise.all(
      Object.entries(UNSYNCED).map(async ([store, { index, keys }]) => {
        if (!db.objectStoreNames.contains(store)) return 0;
        const source = db.transaction(store, 'readonly').objectStore(store).index(index);
        const each = await Promise.all(
          keys.map(
            (key) =>
              new Promise<number>((resolve, reject) => {
                const req = source.count(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error ?? new Error('count failed'));
              }),
          ),
        );
        return each.reduce((a, b) => a + b, 0);
      }),
    );
    // Records as people think of them (marks), never fewer than the ops waiting.
    return Math.max(...counts);
  } finally {
    db.close();
  }
}

/** Service worker caches holding signed-in app shells (C-124). */
const SHELL_CACHES = ['ab-teach-shell'];

/**
 * After signing out: delete this user's offline database and cached teacher screens
 * (ARCHITECTURE §11.7). No Dexie needed: the database is deleted by name.
 */
export async function deleteLocalData(userId: string): Promise<void> {
  guard.release?.();
  await new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(`ab_${userId}`);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
  try {
    await Promise.all(SHELL_CACHES.map((name) => caches.delete(name)));
  } catch {
    // Cache Storage may be unavailable (private mode); nothing cached then.
  }
}
