import 'fake-indexeddb/auto';

import { attendanceKey, openAcademyBeeDB } from '@academybee/sync';
import { describe, expect, it } from 'vitest';

import { countUnsynced } from './unsynced';

describe('countUnsynced (sign-out guard without the sync engine)', () => {
  it('counts unsent marks on the device', async () => {
    const db = openAcademyBeeDB('u1');
    const row = (studentId: string, syncState: 'synced' | 'pending' | 'conflict') => ({
      key: attendanceKey('s1', studentId),
      id: null,
      sessionId: 's1',
      studentId,
      status: 'PRESENT' as const,
      note: null,
      serverVersion: null,
      syncState,
      opId: syncState === 'synced' ? null : 'op1',
      updatedAt: 0,
    });
    await db.attendance.bulkPut([row('a', 'pending'), row('b', 'conflict'), row('c', 'synced')]);
    db.close();
    expect(await countUnsynced('u1')).toBe(2);
  });

  it('is 0 without a database, and never creates one', async () => {
    expect(await countUnsynced('nobody')).toBe(0);
    const names = (await indexedDB.databases()).map((d) => d.name);
    expect(names).not.toContain('ab_nobody');
  });
});
