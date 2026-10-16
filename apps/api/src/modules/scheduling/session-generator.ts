import { localDate, newId } from '@academybee/contracts';
import type { Prisma, TransactionClient } from '@academybee/database';

import { plannedSessions, SESSION_WINDOW_DAYS } from './domain/generate.js';

type Db = Pick<TransactionClient, 'scheduleRule' | 'holiday' | 'classSession' | 'tenant' | 'batch'>;

const day = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Materialise the next 28 days of classes for some or all of an academy's batches (ADR-024,
 * C-112). Inserts only missing (rule, slot date) rows: cancelled, moved and manual sessions are
 * never touched (C-113), and a class moved to another day keeps its slot date, so its original
 * day stays free (review H2). Runs inside the caller's transaction and tenant context. Returns rows created.
 */
export async function generateSessions(
  db: Db,
  input: { tenantId: string; batchIds?: readonly string[]; now?: Date },
): Promise<number> {
  const now = input.now ?? new Date();
  const tenant = await db.tenant.findFirst({
    where: { id: input.tenantId },
    select: { timezone: true },
  });
  if (!tenant) return 0;
  // An academy-wide run (the nightly job) holds the batches' rows for its transaction, so a
  // weekly-pattern save — which updates its batch row first — runs before or after it, never in
  // between (Phase 5 review L2). A save already holds its own batch.
  if (!input.batchIds)
    await db.batch.updateMany({ where: { status: 'ACTIVE' }, data: { updatedAt: new Date() } });
  const today = localDate(now, tenant.timezone);
  const from = new Date(`${today}T00:00:00Z`);
  const until = new Date(from.getTime() + SESSION_WINDOW_DAYS * 86_400_000);
  const rules = await db.scheduleRule.findMany({
    where: {
      ...(input.batchIds ? { batchId: { in: [...input.batchIds] } } : {}),
      effectiveFrom: { lt: until },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
      batch: { status: 'ACTIVE' },
    } satisfies Prisma.ScheduleRuleWhereInput,
    select: {
      id: true,
      batchId: true,
      teacherId: true,
      weekday: true,
      startMinute: true,
      endMinute: true,
      effectiveFrom: true,
      effectiveTo: true,
      batch: { select: { branchId: true, startsOn: true, endsOn: true } },
    },
  });
  if (!rules.length) return 0;
  const holidays = await db.holiday.findMany({
    where: { removedAt: null, startDate: { lt: until }, endDate: { gte: from } },
    select: { startDate: true, endDate: true, branchId: true },
  });
  const planned = plannedSessions(
    rules.map((r) => ({
      id: r.id,
      batchId: r.batchId,
      branchId: r.batch.branchId,
      teacherId: r.teacherId,
      weekday: r.weekday,
      startMinute: r.startMinute,
      endMinute: r.endMinute,
      effectiveFrom: day(r.effectiveFrom)!,
      effectiveTo: day(r.effectiveTo),
      batchStartsOn: day(r.batch.startsOn),
      batchEndsOn: day(r.batch.endsOn),
    })),
    holidays.map((h) => ({
      startDate: day(h.startDate)!,
      endDate: day(h.endDate)!,
      branchId: h.branchId,
    })),
    { from: today, days: SESSION_WINDOW_DAYS, timeZone: tenant.timezone, now },
  );
  if (!planned.length) return 0;
  // A class staff kept from an earlier pattern (moved, cancelled) wins over a new slot at an
  // overlapping time on the same day: no second class appears after a pattern change (C-113).
  const kept = await db.classSession.findMany({
    where: {
      batchId: { in: [...new Set(planned.map((p) => p.batchId))] },
      sessionDate: { gte: from, lt: until },
    },
    select: { batchId: true, scheduleRuleId: true, startsAt: true, endsAt: true },
  });
  const fresh = planned.filter(
    (p) =>
      !kept.some(
        (k) =>
          k.batchId === p.batchId &&
          k.scheduleRuleId !== p.ruleId &&
          k.startsAt < p.endsAt &&
          p.startsAt < k.endsAt,
      ),
  );
  if (!fresh.length) return 0;
  const created = await db.classSession.createMany({
    data: fresh.map((s) => ({
      id: newId(),
      tenantId: input.tenantId,
      branchId: s.branchId,
      batchId: s.batchId,
      scheduleRuleId: s.ruleId,
      teacherId: s.teacherId,
      sessionDate: new Date(`${s.date}T00:00:00Z`),
      slotDate: new Date(`${s.date}T00:00:00Z`),
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      origin: 'GENERATED' as const,
    })),
    skipDuplicates: true,
  });
  return created.count;
}
