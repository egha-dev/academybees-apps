import { addDays, isoWeekday, zonedInstant } from '@academybee/contracts';

/** Rolling window of materialised classes (ADR-024, C-112). */
export const SESSION_WINDOW_DAYS = 28;

/** A weekly slot with what generation needs from its batch. Dates are academy-local `YYYY-MM-DD`. */
export type GenerationRule = {
  id: string;
  batchId: string;
  branchId: string;
  teacherId: string | null;
  weekday: number;
  startMinute: number;
  endMinute: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  batchStartsOn: string | null;
  batchEndsOn: string | null;
};

/** A holiday or closure (G-03): `branchId` null = every branch. */
export type GenerationHoliday = { startDate: string; endDate: string; branchId: string | null };

export type PlannedSession = {
  ruleId: string;
  batchId: string;
  branchId: string;
  teacherId: string | null;
  date: string;
  startsAt: Date;
  endsAt: Date;
};

/**
 * The classes weekly slots produce over `days` days from `from` (ADR-024), in date order:
 * - only inside the slot's effective dates and the batch's start/end dates;
 * - never on a holiday for the batch's branch (ADR-037);
 * - never one that has already started (`now`).
 * Pure: the caller inserts them with "skip duplicates", so existing rows (cancelled, moved,
 * already marked) are never touched (C-113).
 */
export function plannedSessions(
  rules: readonly GenerationRule[],
  holidays: readonly GenerationHoliday[],
  window: { from: string; days: number; timeZone: string; now: Date },
): PlannedSession[] {
  const out: PlannedSession[] = [];
  const nowMs = window.now.getTime();
  for (let i = 0; i < window.days; i++) {
    const date = addDays(window.from, i);
    const weekday = isoWeekday(date);
    for (const rule of rules) {
      if (rule.weekday !== weekday) continue;
      if (date < rule.effectiveFrom || (rule.effectiveTo !== null && date > rule.effectiveTo))
        continue;
      if (rule.batchStartsOn !== null && date < rule.batchStartsOn) continue;
      if (rule.batchEndsOn !== null && date > rule.batchEndsOn) continue;
      if (
        holidays.some(
          (h) =>
            date >= h.startDate &&
            date <= h.endDate &&
            (h.branchId === null || h.branchId === rule.branchId),
        )
      )
        continue;
      const startsAt = zonedInstant(date, rule.startMinute, window.timeZone);
      if (startsAt.getTime() <= nowMs) continue;
      out.push({
        ruleId: rule.id,
        batchId: rule.batchId,
        branchId: rule.branchId,
        teacherId: rule.teacherId,
        date,
        startsAt,
        endsAt: zonedInstant(date, rule.endMinute, window.timeZone),
      });
    }
  }
  return out;
}
