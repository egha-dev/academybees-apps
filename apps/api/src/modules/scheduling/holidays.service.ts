import {
  addDays,
  type Holiday,
  HOLIDAY_MAX_SESSIONS,
  isoWeekday,
  newId,
} from '@academybee/contracts';
import type { Prisma, TenantBoundClient, TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { AnalyticsService } from '../../core/analytics/analytics.service.js';
import { AuditService } from '../../core/audit/audit.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { scopeFor } from '../../core/rbac/scope.js';
import { attends } from './batch-load.js';
import { generateSessions } from './session-generator.js';
import { localTime, SessionsService } from './sessions.service.js';

const at = (d: string) => new Date(`${d}T00:00:00Z`);
const day = (d: Date) => d.toISOString().slice(0, 10);

type HolidayInput = {
  name: string;
  startDate: string;
  endDate: string;
  kind: 'HOLIDAY' | 'CLOSURE';
  branchId?: string | null | undefined;
  /** On confirm: the classes the preview showed (C-115). */
  previewedSessionIds?: string[] | undefined;
};

const HOLIDAY_SELECT = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  kind: true,
  branchId: true,
  removedAt: true,
  _count: {
    select: {
      sessions: { where: { status: 'CANCELLED' as const, cancelReason: 'HOLIDAY' as const } },
    },
  },
} satisfies Prisma.HolidaySelect;

/**
 * Holidays and closures (G-03, ADR-037, C-114, C-115): preview the classes and students affected,
 * then cancel exactly those classes and record one parent notice per expected child (delivered
 * from Phase 6). Removing a future holiday reinstates its classes. Holidays are never deleted.
 */
@Injectable()
export class HolidaysService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
  ) {}

  async list(query: {
    from?: string | undefined;
    includeRemoved: boolean;
  }): Promise<{ items: Holiday[] }> {
    const { today } = await this.sessions.zone();
    const rows = await this.db.holiday.findMany({
      where: {
        endDate: { gte: at(query.from ?? addDays(today, -31)) },
        ...(query.includeRemoved ? {} : { removedAt: null }),
      },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      take: 200,
      select: HOLIDAY_SELECT,
    });
    return { items: rows.map(toHoliday) };
  }

  /** What a holiday would cancel: classes per day and the students expected at them. */
  async preview(input: HolidayInput) {
    const { timeZone, today } = await this.sessions.zone();
    this.assertFuture(input, today);
    const branchId = await this.branch(this.db, input.branchId);
    const affected = await this.affected(this.db, input, branchId);
    const expected = await this.expected(this.db, affected);
    const byDay = new Map<string, typeof affected>();
    for (const s of affected) {
      const d = day(s.sessionDate);
      byDay.set(d, [...(byDay.get(d) ?? []), s]);
    }
    return {
      days: [...byDay.entries()].map(([date, list]) => ({
        date,
        sessions: list.map((s) => ({
          id: s.id,
          batchName: s.batch.name,
          start: localTime(s.startsAt, timeZone),
          end: localTime(s.endsAt, timeZone),
        })),
        students: new Set(list.flatMap((s) => expected.get(s.id) ?? [])).size,
      })),
      totals: {
        sessions: affected.length,
        batches: new Set(affected.map((s) => s.batchId)).size,
        students: new Set([...expected.values()].flat()).size,
      },
    };
  }

  async create(input: HolidayInput) {
    const { today } = await this.sessions.zone();
    this.assertFuture(input, today);
    const id = newId();
    const result = await this.db.$transaction(
      async (tx) => {
        const tenantId = this.cls.get('tenantId')!;
        const branchId = await this.branch(tx, input.branchId);
        const affected = await this.affected(tx, input, branchId);
        if (affected.length > HOLIDAY_MAX_SESSIONS)
          throw new DomainError('VALIDATION_FAILED', 'too many classes', [
            { path: 'endDate', issue: 'too_many_sessions' },
          ]);
        if (input.previewedSessionIds) {
          const seen = new Set(input.previewedSessionIds);
          if (seen.size !== affected.length || affected.some((s) => !seen.has(s.id)))
            throw new DomainError('CONFLICT', 'classes changed since the preview', [
              { path: 'previewedSessionIds', issue: 'preview_changed' },
            ]);
        }
        await tx.holiday.create({
          data: {
            id,
            tenantId,
            branchId,
            name: input.name,
            startDate: at(input.startDate),
            endDate: at(input.endDate),
            kind: input.kind,
            createdById: this.cls.get('membership')?.id ?? null,
          },
        });
        if (affected.length)
          await tx.classSession.updateMany({
            where: { id: { in: affected.map((s) => s.id) }, status: 'SCHEDULED' },
            // No `modifiedAt`: removing the holiday makes them ordinary classes again (C-115).
            data: {
              status: 'CANCELLED',
              cancelReason: 'HOLIDAY',
              cancelledAt: new Date(),
              holidayId: id,
            },
          });
        // One notice per child expected at any cancelled class (C-114), never more.
        const expected = await this.expected(tx, affected);
        const perStudent = new Map<string, { dates: Set<string>; batches: Set<string> }>();
        for (const s of affected)
          for (const studentId of expected.get(s.id) ?? []) {
            const entry = perStudent.get(studentId) ?? { dates: new Set(), batches: new Set() };
            entry.dates.add(day(s.sessionDate));
            entry.batches.add(s.batch.name);
            perStudent.set(studentId, entry);
          }
        if (perStudent.size)
          await tx.notificationIntent.createMany({
            data: [...perStudent.entries()].map(([studentId, e]) => ({
              id: newId(),
              tenantId,
              kind: 'SESSION_CANCELLED_HOLIDAY' as const,
              studentId,
              holidayId: id,
              payload: {
                holiday: input.name,
                dates: [...e.dates].sort().slice(0, 31),
                batches: [...e.batches].slice(0, 10),
              },
            })),
            skipDuplicates: true,
          });
        await this.audit.record(
          {
            action: 'holiday.created',
            entityType: 'Holiday',
            entityId: id,
            metadata: { sessions: affected.length, notices: perStudent.size, kind: input.kind },
          },
          tx,
        );
        await this.analytics.track(tx, 'holiday.created', {
          days:
            Math.round((Date.parse(input.endDate) - Date.parse(input.startDate)) / 86_400_000) + 1,
          sessions: affected.length,
          kind: input.kind,
        });
        return { cancelled: affected.length, notices: perStudent.size };
      },
      { timeout: 30_000 },
    );
    const holiday = await this.db.holiday.findFirst({ where: { id }, select: HOLIDAY_SELECT });
    return { holiday: toHoliday(holiday!), ...result };
  }

  /** Remove a holiday that hasn't fully passed: its future classes come back, notices are voided. */
  async remove(id: string): Promise<Holiday> {
    const { today } = await this.sessions.zone();
    await this.db.$transaction(async (tx) => {
      const holiday = await tx.holiday.findFirst({
        where: { id, removedAt: null },
        select: { id: true, tenantId: true, branchId: true, endDate: true },
      });
      if (!holiday) throw new DomainError('NOT_FOUND', 'holiday');
      this.assertBranch(holiday.branchId);
      if (day(holiday.endDate) < today)
        throw new DomainError('INVALID_STATE_TRANSITION', 'holiday is over', [
          { path: 'endDate', issue: 'past' },
        ]);
      await tx.holiday.update({ where: { id }, data: { removedAt: new Date() } });
      // Bring back only classes still valid on their day (review M1, C-115 "unless changed
      // since"): the batch is active and still runs then, and a generated class's weekly slot
      // is still in effect. The rest are deleted (or stay cancelled if a make-up points at them).
      const cancelled = await tx.classSession.findMany({
        where: {
          holidayId: id,
          status: 'CANCELLED',
          cancelReason: 'HOLIDAY',
          startsAt: { gt: new Date() },
        },
        select: {
          id: true,
          sessionDate: true,
          slotDate: true,
          origin: true,
          batch: { select: { status: true, startsOn: true, endsOn: true } },
          scheduleRule: { select: { effectiveFrom: true, effectiveTo: true } },
          _count: { select: { makeups: true } },
        },
      });
      const valid = (c: (typeof cancelled)[number]) => {
        const date = day(c.sessionDate);
        const slot = day(c.slotDate ?? c.sessionDate);
        const { batch, scheduleRule: rule } = c;
        if (batch.status !== 'ACTIVE') return false;
        if (batch.startsOn && date < day(batch.startsOn)) return false;
        if (batch.endsOn && date > day(batch.endsOn)) return false;
        if (c.origin === 'MANUAL') return true;
        return (
          !!rule &&
          day(rule.effectiveFrom) <= slot &&
          (!rule.effectiveTo || day(rule.effectiveTo) >= slot)
        );
      };
      const reinstate = cancelled.filter(valid).map((c) => c.id);
      const stale = cancelled.filter((c) => !valid(c) && c._count.makeups === 0).map((c) => c.id);
      const back = await tx.classSession.updateMany({
        where: { id: { in: reinstate } },
        data: { status: 'SCHEDULED', cancelReason: null, cancelledAt: null, holidayId: null },
      });
      if (stale.length) await tx.classSession.deleteMany({ where: { id: { in: stale } } });
      await tx.notificationIntent.updateMany({
        where: { holidayId: id, status: 'PENDING' },
        data: { status: 'VOID' },
      });
      // Dates the holiday kept empty get their classes now.
      await generateSessions(tx, { tenantId: holiday.tenantId });
      await this.audit.record(
        {
          action: 'holiday.removed',
          entityType: 'Holiday',
          entityId: id,
          metadata: { reinstated: back.count, dropped: stale.length },
        },
        tx,
      );
    });
    const row = await this.db.holiday.findFirst({ where: { id }, select: HOLIDAY_SELECT });
    return toHoliday(row!);
  }

  // ── helpers ──────────────────────────────────────────────────────────────────────────────

  private assertFuture(input: HolidayInput, today: string) {
    if (input.startDate < today)
      throw new DomainError('VALIDATION_FAILED', 'starts in the past', [
        { path: 'startDate', issue: 'in_past' },
      ]);
  }

  /** A branch-limited member may only add holidays for their own branches. */
  private assertBranch(branchId: string | null) {
    const { scope, ctx } = scopeFor(this.cls, 'timetable.manage');
    if (
      scope === 'BRANCH' &&
      ctx.branchIds.length > 0 &&
      (branchId === null || !ctx.branchIds.includes(branchId))
    )
      throw new DomainError('NOT_FOUND', 'branch');
  }

  private async branch(db: Pick<TransactionClient, 'branch'>, branchId: string | null | undefined) {
    if (branchId) {
      const b = await db.branch.findFirst({ where: { id: branchId }, select: { id: true } });
      if (!b) throw new DomainError('NOT_FOUND', 'branch');
    }
    this.assertBranch(branchId ?? null);
    return branchId ?? null;
  }

  private affected(
    db: Pick<TransactionClient, 'classSession'>,
    input: HolidayInput,
    branchId: string | null,
  ) {
    return db.classSession.findMany({
      where: {
        status: 'SCHEDULED',
        sessionDate: { gte: at(input.startDate), lte: at(input.endDate) },
        startsAt: { gt: new Date() },
        ...(branchId ? { branchId } : {}),
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: HOLIDAY_MAX_SESSIONS + 1,
      select: {
        id: true,
        batchId: true,
        sessionDate: true,
        startsAt: true,
        endsAt: true,
        batch: { select: { name: true } },
      },
    });
  }

  /** Students expected at each session (C-120: open on that date, and the day is in their plan). */
  private async expected(
    db: Pick<TransactionClient, 'batchEnrolment'>,
    sessions: { id: string; batchId: string; sessionDate: Date }[],
  ): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (!sessions.length) return out;
    const enrolments = await db.batchEnrolment.findMany({
      where: { batchId: { in: [...new Set(sessions.map((s) => s.batchId))] } },
      select: { batchId: true, studentId: true, startedOn: true, endedOn: true, weekdays: true },
    });
    for (const s of sessions) {
      const date = day(s.sessionDate);
      const weekday = isoWeekday(date);
      out.set(
        s.id,
        enrolments
          .filter(
            (e) =>
              e.batchId === s.batchId &&
              day(e.startedOn) <= date &&
              (e.endedOn === null || day(e.endedOn) >= date) &&
              attends(e.weekdays, weekday),
          )
          .map((e) => e.studentId),
      );
    }
    return out;
  }
}

function toHoliday(h: Prisma.HolidayGetPayload<{ select: typeof HOLIDAY_SELECT }>): Holiday {
  return {
    id: h.id,
    name: h.name,
    startDate: day(h.startDate),
    endDate: day(h.endDate),
    kind: h.kind,
    branchId: h.branchId,
    removedAt: h.removedAt?.toISOString() ?? null,
    cancelledSessions: h._count.sessions,
  };
}
