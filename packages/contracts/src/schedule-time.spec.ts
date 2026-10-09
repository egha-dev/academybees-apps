import { describe, expect, it } from 'vitest';

import {
  addDays,
  isoWeekday,
  localDate,
  minutesToTime,
  timeToMinutes,
  weeklyOccurrences,
  zonedInstant,
} from './schedule-time.js';

describe('academy-local dates and times (ADR-011, ADR-024)', () => {
  it('today depends on the academy timezone', () => {
    const instant = new Date('2026-10-08T20:00:00Z'); // 01:30 on the 9th in India
    expect(localDate(instant, 'Asia/Kolkata')).toBe('2026-10-09');
    expect(localDate(instant, 'America/New_York')).toBe('2026-10-08');
  });

  it('calendar arithmetic crosses months and years', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(isoWeekday('2026-10-12')).toBe(1); // Monday
    expect(isoWeekday('2026-10-18')).toBe(7); // Sunday
  });

  it('17:00 in Kolkata is 11:30 UTC', () => {
    expect(zonedInstant('2026-10-12', 17 * 60, 'Asia/Kolkata').toISOString()).toBe(
      '2026-10-12T11:30:00.000Z',
    );
  });

  it('handles daylight saving: summer, winter, the spring gap and the autumn repeat', () => {
    expect(zonedInstant('2026-07-01', 9 * 60, 'America/New_York').toISOString()).toBe(
      '2026-07-01T13:00:00.000Z',
    );
    expect(zonedInstant('2026-12-01', 9 * 60, 'America/New_York').toISOString()).toBe(
      '2026-12-01T14:00:00.000Z',
    );
    // 02:30 doesn't exist on 8 March 2026 in New York: the class moves to just after the gap.
    expect(zonedInstant('2026-03-08', 150, 'America/New_York').toISOString()).toBe(
      '2026-03-08T07:30:00.000Z',
    );
    // 01:30 happens twice on 1 November 2026: the first one.
    expect(zonedInstant('2026-11-01', 90, 'America/New_York').toISOString()).toBe(
      '2026-11-01T05:30:00.000Z',
    );
    expect(zonedInstant('2026-03-29', 18 * 60, 'Europe/London').toISOString()).toBe(
      '2026-03-29T17:00:00.000Z',
    );
  });

  it('turns weekly slots into dated classes over a window', () => {
    const slots = [{ weekday: 1 }, { weekday: 3 }];
    const out = weeklyOccurrences(slots, '2026-10-09', 14); // Friday
    expect(out.map((o) => o.date)).toEqual([
      '2026-10-12',
      '2026-10-14',
      '2026-10-19',
      '2026-10-21',
    ]);
    expect(timeToMinutes('17:30')).toBe(1050);
    expect(minutesToTime(1050)).toBe('17:30');
  });
});
