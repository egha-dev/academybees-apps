// Plain module (no React, no Dexie): the shell's sign-out button reads it on every page.

type Guard = {
  /** Records on this device that haven't reached the server. */
  unsynced: number;
  /** Close local connections before the data is deleted. */
  release?: () => void;
};

let guard: Guard = { unsynced: 0 };
const listeners = new Set<() => void>();

/** Set by the Teacher PWA while its sync engine runs (ARCHITECTURE §11.6 logout guard). */
export function setSignOutGuard(next: Guard): void {
  guard = next;
  for (const listener of listeners) listener();
}

export function subscribeSignOutGuard(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function signOutGuard(): Guard {
  return guard;
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
