import { describe, expect, it } from 'vitest';

import { type GenerationHoliday, type GenerationRule, plannedSessions } from './generate.js';

const rule = (over: Partial<GenerationRule> = {}): GenerationRule => ({
  id: 'r1',
  batchId: 'b1',
  branchId: 'br1',
  teacherId: 't1',
  weekday: 1,
  startMinute: 17 * 60,
  endMinute: 18 * 60,
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  batchStartsOn: null,
  batchEndsOn: null,
  ...over,
});
// Thursday 2026-10-01 00:00 IST.
const window = (over = {}) => ({
  from: '2026-10-01',
  days: 28,
  timeZone: 'Asia/Kolkata',
  now: new Date('2026-09-30T18:30:00Z'),
  ...over,
});
const days = (rules: GenerationRule[], holidays: GenerationHoliday[] = [], w = window()) =>
  plannedSessions(rules, holidays, w).map((s) => s.date);

describe('plannedSessions', () => {
  it('2, 3, 5 and 7 classes a week, each slot at its own time', () => {
    const weekend = [6, 7].map((weekday) => rule({ id: `w${weekday}`, weekday }));
    const mwf = [1, 3, 5].map((weekday) => rule({ id: `m${weekday}`, weekday }));
    const weekdays = [1, 2, 3, 4, 5].map((weekday) => rule({ id: `d${weekday}`, weekday }));
    const daily = [1, 2, 3, 4, 5, 6, 7].map((weekday) => rule({ id: `e${weekday}`, weekday }));
    expect(days(weekend)).toHaveLength(8);
    expect(days(mwf)).toHaveLength(12);
    expect(days(weekdays)).toHaveLength(20);
    expect(days(daily)).toHaveLength(28);
    // Tue 17:00 and Sat 10:00 (different times per day).
    const mixed = plannedSessions(
      [
        rule({ id: 'tue', weekday: 2 }),
        rule({ id: 'sat', weekday: 6, startMinute: 600, endMinute: 690 }),
      ],
      [],
      window({ days: 7 }),
    );
    expect(mixed.map((s) => [s.date, s.startsAt.toISOString()])).toEqual([
      ['2026-10-03', '2026-10-03T04:30:00.000Z'],
      ['2026-10-06', '2026-10-06T11:30:00.000Z'],
    ]);
  });

  it('respects effective dates (timing change from a date) and batch start/end', () => {
    const old = rule({ id: 'old', effectiveTo: '2026-10-11' });
    const summer = rule({
      id: 'new',
      effectiveFrom: '2026-10-12',
      startMinute: 7 * 60,
      endMinute: 8 * 60,
    });
    const planned = plannedSessions([old, summer], [], window());
    expect(planned.filter((s) => s.ruleId === 'old').map((s) => s.date)).toEqual(['2026-10-05']);
    expect(planned.filter((s) => s.ruleId === 'new').map((s) => s.date)).toEqual([
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ]);
    expect(days([rule({ batchStartsOn: '2026-10-10', batchEndsOn: '2026-10-20' })])).toEqual([
      '2026-10-12',
      '2026-10-19',
    ]);
  });

  it('skips holidays for the whole academy or the batch’s own branch only', () => {
    const r = rule();
    expect(
      days([r], [{ startDate: '2026-10-05', endDate: '2026-10-05', branchId: null }]),
    ).not.toContain('2026-10-05');
    expect(
      days([r], [{ startDate: '2026-10-05', endDate: '2026-10-12', branchId: 'br1' }]),
    ).toEqual(['2026-10-19', '2026-10-26']);
    expect(
      days([r], [{ startDate: '2026-10-05', endDate: '2026-10-05', branchId: 'other' }]),
    ).toContain('2026-10-05');
  });

  it('never creates a class that has already started, and is the same on every run', () => {
    // Monday 2026-10-05 17:30 IST: today's 17:00 class has started.
    const w = window({ from: '2026-10-05', now: new Date('2026-10-05T12:00:00Z') });
    expect(days([rule()], [], w)[0]).toBe('2026-10-12');
    expect(plannedSessions([rule()], [], window())).toEqual(
      plannedSessions([rule()], [], window()),
    );
  });

  it('keeps the local time across a DST change (Europe/London)', () => {
    const london = plannedSessions(
      [rule({ weekday: 7, startMinute: 10 * 60, endMinute: 11 * 60 })],
      [],
      window({
        from: '2026-10-18',
        days: 14,
        timeZone: 'Europe/London',
        now: new Date('2026-10-01T00:00:00Z'),
      }),
    );
    // BST until 25 October 2026, then GMT: 10:00 local both times.
    expect(london.map((s) => s.startsAt.toISOString())).toEqual([
      '2026-10-18T09:00:00.000Z',
      '2026-10-25T10:00:00.000Z',
    ]);
  });
});
