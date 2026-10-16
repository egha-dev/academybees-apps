import { addDays, minutesToTime, newId, type Schedule, timeToMinutes } from '@academybee/contracts';
import type { Prisma, TenantBoundClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { ActivityService } from '../../core/activity/activity.service.js';
import { AnalyticsService } from '../../core/analytics/analytics.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { scopedWhere } from '../../core/rbac/scope.js';
import { batchLoads } from './batch-load.js';
import { batchPolicy } from './scheduling.policy.js';
import { generateSessions } from './session-generator.js';
import { SESSION_SELECT, SessionsService, toSession } from './sessions.service.js';

const at = (d: string) => new Date(`${d}T00:00:00Z`);
const day = (d: Date) => d.toISOString().slice(0, 10);

type SlotInput = {
  weekday: number;
  start: string;
  end: string;
  teacherId?: string | null | undefined;
};

/**
 * A batch's weekly pattern (ADR-024, C-113, C-121): 2, 3, 5 or 7 days a week, each slot with its
 * own time and optional teacher. Saving applies **from a date**: rules in effect end the day
 * before, their untouched classes from that date are replaced, and anything staff changed stays.
 */
@Injectable()
export class ScheduleService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly sessions: SessionsService,
    private readonly activity: ActivityService,
    private readonly analytics: AnalyticsService,
  ) {}

  private async batch(id: string, capability: 'batch.read' | 'timetable.manage') {
    const batch = await this.db.batch.findFirst({
      where: {
        AND: [{ id }, scopedWhere(this.cls, capability, batchPolicy) as Prisma.BatchWhereInput],
      },
      select: { id: true, tenantId: true, status: true },
    });
    if (!batch) throw new DomainError('NOT_FOUND', 'batch');
    return batch;
  }

  async get(batchId: string): Promise<Schedule> {
    await this.batch(batchId, 'batch.read');
    return this.view(batchId);
  }

  async save(
    batchId: string,
    input: { from?: string | undefined; slots: SlotInput[] },
  ): Promise<Schedule> {
    const batch = await this.batch(batchId, 'timetable.manage');
    if (batch.status !== 'ACTIVE')
      throw new DomainError('INVALID_STATE_TRANSITION', 'batch archived', [
        { path: 'batchId', issue: 'archived' },
      ]);
    const { today } = await this.sessions.zone();
    const from = input.from ?? today;
    if (from < today)
      throw new DomainError('VALIDATION_FAILED', 'cannot change the past', [
        { path: 'from', issue: 'in_past' },
      ]);
    await this.db.$transaction(async (tx) => {
      const primary = await tx.batchTeacher.findFirst({
        where: { batchId },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        select: { teacherId: true },
      });
      const explicit = [
        ...new Set(input.slots.map((s) => s.teacherId).filter((t): t is string => !!t)),
      ];
      if (explicit.length) {
        const found = await tx.teacher.count({ where: { id: { in: explicit }, status: 'ACTIVE' } });
        if (found !== explicit.length) throw new DomainError('NOT_FOUND', 'teacher');
      }
      // One save at a time per batch: the version bump locks the batch row until commit, so two
      // concurrent saves can't both add a rule set and double the classes (review H1).
      await tx.batch.update({ where: { id: batchId }, data: { version: { increment: 1 } } });
      const current = await tx.scheduleRule.findMany({
        where: { batchId, OR: [{ effectiveTo: null }, { effectiveTo: { gte: at(from) } }] },
        select: { id: true, effectiveFrom: true },
      });
      // Rules that started before `from` end the day before; rules starting on or after it (a save
      // earlier today, a future-dated change) are replaced outright (review H1).
      const ending = current.filter((r) => day(r.effectiveFrom) < from).map((r) => r.id);
      const replaced = current.filter((r) => day(r.effectiveFrom) >= from).map((r) => r.id);
      if (ending.length)
        await tx.scheduleRule.updateMany({
          where: { id: { in: ending } },
          data: { effectiveTo: at(addDays(from, -1)), version: { increment: 1 } },
        });
      if (current.length)
        // Only untouched classes go (C-113): changed, cancelled and manual ones stay.
        await tx.classSession.deleteMany({
          where: {
            scheduleRuleId: { in: current.map((r) => r.id) },
            sessionDate: { gte: at(from) },
            status: 'SCHEDULED',
            origin: 'GENERATED',
            modifiedAt: null,
          },
        });
      if (replaced.length) {
        // Classes staff kept from a replaced rule stay as one-off classes, then the rule goes.
        await tx.classSession.updateMany({
          where: { scheduleRuleId: { in: replaced } },
          data: { scheduleRuleId: null, slotDate: null, origin: 'MANUAL' },
        });
        await tx.scheduleRule.deleteMany({ where: { id: { in: replaced } } });
      }
      if (input.slots.length)
        await tx.scheduleRule.createMany({
          data: input.slots.map((s) => ({
            id: newId(),
            tenantId: batch.tenantId,
            batchId,
            teacherId: s.teacherId !== undefined ? s.teacherId : (primary?.teacherId ?? null),
            weekday: s.weekday,
            startMinute: timeToMinutes(s.start),
            endMinute: timeToMinutes(s.end),
            effectiveFrom: at(from),
          })),
        });
      await generateSessions(tx, { tenantId: batch.tenantId, batchIds: [batchId] });
      const days = new Set(input.slots.map((s) => s.weekday)).size;
      await this.activity.record(tx, {
        tenantId: batch.tenantId,
        entityType: 'BATCH',
        entityId: batchId,
        type: 'batch.updated',
        data: { schedule: input.slots.length, days, from },
      });
      await this.analytics.track(tx, 'batch.schedule_saved', {
        slots: input.slots.length,
        days,
        fromToday: from === today,
      });
    });
    return this.view(batchId, from);
  }

  /** The pattern in effect from `on` (default today), the next classes and the warnings. */
  private async view(batchId: string, on?: string): Promise<Schedule> {
    const { timeZone, today } = await this.sessions.zone();
    const date = on ?? today;
    const [rules, upcoming, loads, enrolments] = await Promise.all([
      this.db.scheduleRule.findMany({
        where: {
          batchId,
          effectiveFrom: { lte: at(date) },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: at(date) } }],
        },
        orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
        select: {
          id: true,
          weekday: true,
          startMinute: true,
          endMinute: true,
          teacherId: true,
          effectiveFrom: true,
          teacher: { select: { fullName: true } },
        },
      }),
      this.db.classSession.findMany({
        where: { batchId, startsAt: { gt: new Date() } },
        orderBy: { startsAt: 'asc' },
        take: 12,
        select: SESSION_SELECT,
      }),
      batchLoads(this.db, [batchId], date),
      this.db.batchEnrolment.findMany({
        where: {
          batchId,
          startedOn: { lte: at(date) },
          OR: [{ endedOn: null }, { endedOn: { gte: at(date) } }],
          NOT: { weekdays: { isEmpty: true } },
        },
        select: { id: true, weekdays: true, student: { select: { fullName: true } } },
      }),
    ]);
    const meets = loads.get(batchId)!.weekdays;
    const scheduled = upcoming.filter((s) => s.status === 'SCHEDULED');
    return {
      slots: rules.map((r) => ({
        id: r.id,
        weekday: r.weekday,
        start: minutesToTime(r.startMinute),
        end: minutesToTime(r.endMinute),
        teacherId: r.teacherId,
        teacherName: r.teacher?.fullName ?? null,
        effectiveFrom: day(r.effectiveFrom),
      })),
      upcoming: upcoming.map((s) => toSession(s, timeZone)),
      doubleBookings: await this.sessions.doubleBookings(this.db, scheduled, timeZone),
      plansOutside: enrolments
        .filter((e) => e.weekdays.some((w) => !meets.includes(w)))
        .map((e) => ({ enrolmentId: e.id, studentName: e.student.fullName, weekdays: e.weekdays })),
    };
  }
}
