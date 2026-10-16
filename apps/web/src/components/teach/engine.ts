// Loaded only inside the Teacher PWA's lazy chunk (Dexie and the sync engine stay out of the
// shell's route budget, C-99, G-24).
import { SyncClient, SyncEngine } from '@academybee/sync';

import { csrfToken, refreshSession } from '@/lib/api';
import { setSignOutGuard } from '@/lib/unsynced';

const DEVICE_KEY = 'ab_device_id';

/** A random id for this browser, kept so the server's ledger can tell devices apart. */
function deviceId(): string {
  try {
    const known = localStorage.getItem(DEVICE_KEY);
    if (known) return known;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

type Listener = () => void;
let current: { userId: string; engine: SyncEngine; listeners: Set<Listener> } | undefined;
let authLost = false;

/** Change notifications for screens (a pull finished, a push answered, sign-in needed). */
export function onEngineChange(listener: Listener): () => void {
  current?.listeners.add(listener);
  return () => current?.listeners.delete(listener);
}

/** True when the server asked for a fresh sign-in that a token refresh couldn't give. */
export function needsSignIn(): boolean {
  return authLost;
}

/**
 * The one sync engine for this signed-in user on this page (ADR-016). Starts on first use:
 * persistent storage is requested, queued work resumes, the working set is pulled. A session
 * that expired is refreshed quietly; only if that fails does the screen ask for sign-in, and
 * nothing queued is lost (ARCHITECTURE §11.4).
 */
export function engineFor(userId: string): SyncEngine {
  if (current?.userId === userId) return current.engine;
  current?.engine.stop();
  const listeners = new Set<Listener>();
  const notify = () => listeners.forEach((l) => l());
  const engine: SyncEngine = new SyncEngine({
    userId,
    deviceId: deviceId(),
    csrf: csrfToken,
    onChange: notify,
    onAuthRequired: () => {
      void refreshSession().then((ok) => {
        authLost = !ok;
        if (ok) engine.runner.resume();
        notify();
      });
    },
    onRevoked: () => {
      setSignOutGuard({ unsynced: 0 });
      // Access ended and local data is gone: back to sign-in.

      window.location.assign('/login');
    },
  });
  current = { userId, engine, listeners };
  void startEngine(engine);
  return engine;
}

async function startEngine(engine: SyncEngine) {
  await SyncClient.requestPersistence();
  await engine.start();
  // A pull that needed a fresh session: refresh once and pull again.
  if ((await engine.client.watermark()) === null && !authLost) {
    if (await refreshSession()) await engine.pull();
  }
  void engine.beacon();
}

/** Cache the teacher screens so they open offline next time (C-124). */
export async function warmShells(): Promise<void> {
  try {
    const cache = await caches.open('ab-teach-shell');
    await cache.addAll([
      '/teach',
      '/teach/classes',
      '/teach/attendance',
      '/teach/students',
      '/teach/sync',
      '/teach/more',
    ]);
  } catch {
    // Offline or no Cache Storage: the screens are cached as they are opened instead.
  }
}
