import type { TransactionClient } from '@academybee/database';

type Db = Pick<TransactionClient, 'scheduleRule' | 'batchEnrolment'>;

export type BatchLoad = {
  /** Weekdays the batch meets on `on` (its current weekly pattern). */
  weekdays: number[];
  /** Students with an enrolment open on `on`. */
  enrolled: number;
  /** Students expected per meeting weekday (C-120: day plans counted only on their days). */
  dayLoad: { weekday: number; students: number }[];
};

const at = (d: string) => new Date(`${d}T00:00:00Z`);

/** Does a day plan (`weekdays`, empty = every day) include `weekday`? */
export function attends(plan: readonly number[], weekday: number): boolean {
  return plan.length === 0 || plan.includes(weekday);
}

/**
 * Who is expected when, per batch, on an academy-local date (C-120, C-121): the meeting weekdays
 * from the weekly slots in effect, and the open enrolments counted on the days of their plan.
 * `extra` adds a prospective enrolment (for "would this go over capacity?").
 */
export async function batchLoads(
  db: Db,
  batchIds: readonly string[],
  on: string,
  extra?: { batchId: string; weekdays: readonly number[]; excludeEnrolmentId?: string },
): Promise<Map<string, BatchLoad>> {
  const out = new Map<string, BatchLoad>();
  if (!batchIds.length) return out;
  const [rules, enrolments] = await Promise.all([
    db.scheduleRule.findMany({
      where: {
        batchId: { in: [...batchIds] },
        effectiveFrom: { lte: at(on) },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: at(on) } }],
      },
      select: { batchId: true, weekday: true },
    }),
    db.batchEnrolment.findMany({
      where: {
        batchId: { in: [...batchIds] },
        startedOn: { lte: at(on) },
        OR: [{ endedOn: null }, { endedOn: { gte: at(on) } }],
      },
      select: { id: true, batchId: true, weekdays: true },
    }),
  ]);
  for (const id of batchIds) {
    const weekdays = [...new Set(rules.filter((r) => r.batchId === id).map((r) => r.weekday))].sort(
      (a, b) => a - b,
    );
    const plans = enrolments
      .filter((e) => e.batchId === id && e.id !== extra?.excludeEnrolmentId)
      .map((e) => e.weekdays);
    if (extra?.batchId === id) plans.push([...extra.weekdays]);
    out.set(id, {
      weekdays,
      enrolled: plans.length,
      dayLoad: weekdays.map((weekday) => ({
        weekday,
        students: plans.filter((p) => attends(p, weekday)).length,
      })),
    });
  }
  return out;
}

/** The days over capacity (C-121), fullest first. */
export function overCapacity(load: BatchLoad, capacity: number | null): number[] {
  if (capacity === null) return [];
  return load.dayLoad.filter((d) => d.students > capacity).map((d) => d.weekday);
}
