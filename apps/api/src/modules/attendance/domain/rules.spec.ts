import { describe, expect, it } from 'vitest';

import { decide, editableUntil, type ExistingMark, lockFor, percentOf } from './rules.js';

const ME = 'me';
const mark = (over: Partial<ExistingMark> = {}): ExistingMark => ({
  status: 'PRESENT',
  note: null,
  version: 3,
  markedById: 'other',
  ...over,
});

describe('decide (ADR-017 truth table)', () => {
  it('creates when there is no mark yet', () => {
    expect(decide(null, { status: 'ABSENT' }, ME)).toBe('create');
  });
  it('does nothing for the same value, even from a stale base or another user', () => {
    expect(decide(mark(), { status: 'PRESENT', baseVersion: 1 }, ME)).toBe('noop');
    expect(decide(mark({ note: 'x' }), { status: 'PRESENT' }, ME)).toBe('noop');
  });
  it('applies an edit from the current version', () => {
    expect(decide(mark(), { status: 'ABSENT', baseVersion: 3 }, ME)).toBe('apply');
  });
  it('applies a stale edit when the current value is the same person’s', () => {
    expect(decide(mark({ markedById: ME }), { status: 'ABSENT', baseVersion: 1 }, ME)).toBe(
      'apply',
    );
    expect(decide(mark({ markedById: ME }), { status: 'ABSENT' }, ME)).toBe('apply');
  });
  it('conflicts on a stale edit over someone else’s different value', () => {
    expect(decide(mark(), { status: 'ABSENT', baseVersion: 2 }, ME)).toBe('conflict');
    expect(decide(mark(), { status: 'ABSENT' }, ME)).toBe('conflict');
    expect(decide(mark(), { status: 'PRESENT', note: 'came late', baseVersion: 1 }, ME)).toBe(
      'conflict',
    );
  });
});

describe('windows (C-130)', () => {
  const tz = 'Asia/Kolkata';
  // Class on 2026-10-05 17:00–18:00 IST = 11:30–12:30 UTC.
  const session = {
    status: 'SCHEDULED',
    date: '2026-10-05',
    endsAt: new Date('2026-10-05T12:30:00Z'),
  };
  const at = (iso: string, today: string) => ({ now: new Date(iso), today, timeZone: tz });

  it('teachers may change a roll call until 48 h after the class ends', () => {
    expect(editableUntil(session, 'online', tz).toISOString()).toBe('2026-10-07T12:30:00.000Z');
    const teacher = { source: 'online' as const, canEditPast: false };
    expect(lockFor(session, at('2026-10-07T12:29:00Z', '2026-10-07'), teacher)).toBeNull();
    expect(lockFor(session, at('2026-10-07T12:31:00Z', '2026-10-07'), teacher)).toBe(
      'window_closed',
    );
  });
  it('offline changes are accepted until the end of the 7th day after the class date', () => {
    // End of 2026-10-12 IST = 2026-10-12T18:30Z.
    expect(editableUntil(session, 'sync', tz).toISOString()).toBe('2026-10-12T18:30:00.000Z');
    const synced = { source: 'sync' as const, canEditPast: false };
    expect(lockFor(session, at('2026-10-12T18:00:00Z', '2026-10-12'), synced)).toBeNull();
    expect(lockFor(session, at('2026-10-12T19:00:00Z', '2026-10-13'), synced)).toBe(
      'window_closed',
    );
  });
  it('edit_past lifts the window; cancelled and future classes stay locked', () => {
    const owner = { source: 'online' as const, canEditPast: true };
    expect(lockFor(session, at('2027-01-01T00:00:00Z', '2027-01-01'), owner)).toBeNull();
    expect(
      lockFor({ ...session, status: 'CANCELLED' }, at('2026-10-05T12:00:00Z', '2026-10-05'), owner),
    ).toBe('cancelled');
    expect(lockFor(session, at('2026-10-04T12:00:00Z', '2026-10-04'), owner)).toBe('not_yet');
  });
});

describe('percentOf', () => {
  it('counts present and late as attended and leaves out leave', () => {
    expect(percentOf({ PRESENT: 3, LATE: 1, ABSENT: 1 })).toBe(80);
    expect(percentOf({ PRESENT: 0, LATE: 0, ABSENT: 0 })).toBeNull();
    expect(percentOf({ PRESENT: 2, LATE: 0, ABSENT: 1 })).toBe(66.7);
  });
});
