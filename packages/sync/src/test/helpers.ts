import { AcademyBeeDB } from '../db.js';
import { SyncQueue } from '../queue.js';

let counter = 0;

/** A fresh database name per test; `clock.now` is controllable. */
export function createTestQueue(name = `test-${Date.now()}-${counter++}`) {
  const clock = { now: 1_800_000_000_000 };
  const db = new AcademyBeeDB(name);
  const queue = new SyncQueue(db, { deviceId: 'device-1', now: () => clock.now, random: () => 0 });
  return { name, db, queue, clock };
}

export const markSession = (session: string, present: string[] = []) => ({
  type: 'attendance.markSession' as const,
  entityKey: `session:${session}`,
  payload: { present },
});
