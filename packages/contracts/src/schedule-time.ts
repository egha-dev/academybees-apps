/**
 * Calendar dates and local times in an academy's timezone (ADR-011, ADR-024): a class is "Monday
 * 17:00 in Asia/Kolkata"; we store its date as a `date` and its start/end as UTC instants. Pure
 * functions on `Intl`, so they work the same in the API, the worker and the browser.
 */

/** Today's date (`YYYY-MM-DD`) in `timeZone`. */
export function localDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts; // en-CA formats as YYYY-MM-DD
}

/** `YYYY-MM-DD` + `days` (calendar arithmetic, no timezone involved). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday of a calendar date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (e.g. +330 for Asia/Kolkata). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * The UTC instant of `minute` minutes after local midnight on `date` in `timeZone`. Handles DST:
 * a time skipped by a spring-forward resolves to the instant just after the gap; an hour that
 * repeats in autumn resolves to its first occurrence.
 */
export function zonedInstant(date: string, minute: number, timeZone: string): Date {
  const wall = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    Math.floor(minute / 60),
    minute % 60,
  );
  // Two passes converge for every real-world zone (offsets change at most once near a time).
  let guess = wall - offsetMinutes(new Date(wall), timeZone) * 60_000;
  const second = wall - offsetMinutes(new Date(guess), timeZone) * 60_000;
  if (second !== guess) guess = Math.max(guess, second);
  return new Date(guess);
}

/** `HH:MM` ↔ minutes after midnight. */
export function timeToMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}
export function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * Class dates for weekly slots over `days` days from `from` (inclusive), in date order: what the
 * onboarding generates synchronously until the Phase 5 job exists (C-92).
 */
export function weeklyOccurrences<T extends { weekday: number }>(
  slots: readonly T[],
  from: string,
  days: number,
): { date: string; slot: T }[] {
  const out: { date: string; slot: T }[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const weekday = isoWeekday(date);
    for (const slot of slots) if (slot.weekday === weekday) out.push({ date, slot });
  }
  return out;
}
