import { addDays, type AttendanceStatus, zonedInstant } from '@academybee/contracts';

/** The server's current mark for one student in one class. */
export type ExistingMark = {
  status: AttendanceStatus;
  note: string | null;
  version: number;
  markedById: string;
};
/** What the client proposes. No `baseVersion` = the client had no mark. */
export type ProposedMark = {
  status: AttendanceStatus;
  note?: string | null | undefined;
  baseVersion?: number | undefined;
};
export type MarkDecision = 'create' | 'apply' | 'noop' | 'conflict';

/**
 * ADR-017 conflict rule for one (class, student):
 * - no mark yet → create;
 * - the same value (status and note) → nothing to do, whatever the base;
 * - the client edited from the current version → apply;
 * - a stale base, last set by the same person → apply (their later intent wins);
 * - a stale base, last set by someone else, with a different value → conflict (they choose).
 */
export function decide(existing: ExistingMark | null, proposed: ProposedMark, me: string) {
  if (!existing) return 'create' satisfies MarkDecision;
  const note = proposed.note === undefined ? existing.note : proposed.note;
  if (existing.status === proposed.status && existing.note === note) return 'noop';
  if (proposed.baseVersion === existing.version) return 'apply';
  if (existing.markedById === me) return 'apply';
  return 'conflict';
}

export const TEACHER_EDIT_HOURS = 48;
export const OFFLINE_ACCEPT_DAYS = 7;

export type AttendanceLock = 'cancelled' | 'not_yet' | 'window_closed';

/**
 * Until when a roll call may be changed without `attendance.edit_past` (C-130, OD-11): 48 h after
 * the class ends; changes made offline and synced later are accepted until the end of the 7th
 * day after the class date (academy-local).
 */
export function editableUntil(
  session: { date: string; endsAt: Date },
  source: 'online' | 'sync',
  timeZone: string,
  windows = { teacherEditHours: TEACHER_EDIT_HOURS, offlineAcceptDays: OFFLINE_ACCEPT_DAYS },
): Date {
  const edit = new Date(session.endsAt.getTime() + windows.teacherEditHours * 3_600_000);
  if (source === 'online') return edit;
  const offline = zonedInstant(addDays(session.date, windows.offlineAcceptDays + 1), 0, timeZone);
  return offline > edit ? offline : edit;
}

/**
 * Why the caller can't change this roll call now, or null (C-129, C-130). A queued change
 * (`sync`) must have been **made** within the 48 h edit window (`madeAt`, the device's time,
 * never later than now) and **arrive** within the 7-day offline window.
 */
export function lockFor(
  session: { status: string; date: string; endsAt: Date },
  at: { now: Date; today: string; timeZone: string },
  options: { source: 'online' | 'sync'; canEditPast: boolean; madeAt?: Date | undefined },
): AttendanceLock | null {
  if (session.status === 'CANCELLED') return 'cancelled';
  if (session.date > at.today) return 'not_yet';
  if (options.canEditPast) return null;
  const edit = editableUntil(session, 'online', at.timeZone);
  if (options.source === 'online') return at.now > edit ? 'window_closed' : null;
  const made = options.madeAt && options.madeAt < at.now ? options.madeAt : at.now;
  return at.now > editableUntil(session, 'sync', at.timeZone) || made > edit
    ? 'window_closed'
    : null;
}

/** Present and Late count as attended; Leave is left out (an informed absence). */
export function percentOf(counts: { PRESENT: number; ABSENT: number; LATE: number }) {
  const counted = counts.PRESENT + counts.ABSENT + counts.LATE;
  return counted === 0 ? null : Math.round(((counts.PRESENT + counts.LATE) / counted) * 1000) / 10;
}
