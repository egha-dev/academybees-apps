import { localDate, newId, type Session, timeToMinutes, zonedInstant } from '@academybee/contracts';
import type { Prisma, TenantBoundClient, TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { ActivityService } from '../../core/activity/activity.service.js';
import { AnalyticsService } from '../../core/analytics/analytics.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { scopedWhere } from '../../core/rbac/scope.js';
import { batchPolicy, sessionPolicy } from './scheduling.policy.js';

export const SESSION_SELECT = {
  id: true,
  batchId: true,
  branchId: true,
  teacherId: true,
  sessionDate: true,
  startsAt: true,
  endsAt: true,
  status: true,
  origin: true,
  cancelReason: true,
  makeupForSessionId: true,
  modifiedAt: true,
  note: true,
  version: true,
  batch: { select: { name: true, course: { select: { name: true } } } },
  teacher: { select: { fullName: true } },
  holiday: { select: { name: true } },
} satisfies Prisma.ClassSessionSelect;
export type SessionRow = Prisma.ClassSessionGetPayload<{ select: typeof SESSION_SELECT }>;

export type DoubleBooking = {
  sessionId: string;
  teacherName: string;
  date: string;
  start: string;
  end: string;
  otherBatchName: string;
};

/** Local `HH:MM` of an instant in the academy's timezone. */
export function localTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}

export function toSession(r: SessionRow, timeZone: string): Session {
  return {
    id: r.id,
    batchId: r.batchId,
    batchName: r.batch.name,
    courseName: r.batch.course.name,
    branchId: r.branchId,
    teacherId: r.teacherId,
    teacherName: r.teacher?.fullName ?? null,
    date: r.sessionDate.toISOString().slice(0, 10),
    start: localTime(r.startsAt, timeZone),
    end: localTime(r.endsAt, timeZone),
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    status: r.status,
    origin: r.origin,
    cancelReason: r.cancelReason,
    holidayName: r.holiday?.name ?? null,
    makeupForSessionId: r.makeupForSessionId,
    changed: r.modifiedAt !== null || r.origin === 'MANUAL',
    note: r.note,
    version: r.version,
  };
}

const at = (d: string) => new Date(`${d}T00:00:00Z`);

/**
 * Class sessions (ADR-024, PRD v3 §9): concrete classes on a date, independently cancellable and
 * movable. Every change by staff sets `modifiedAt`, so weekly-pattern edits never overwrite it
 * (C-113). Times are academy-local in the API, stored as UTC instants (C-119).
 */
@Injectable()
export class SessionsService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly activity: ActivityService,
    private readonly analytics: AnalyticsService,
  ) {}

  scope(
    capability: 'timetable.read' | 'session.manage' | 'attendance.read' | 'attendance.mark',
  ): Prisma.ClassSessionWhereInput {
    return scopedWhere(this.cls, capability, sessionPolicy);
  }

  /**
   * One class for attendance, within the caller's scope for `capability` (C-122: the attendance
   * module reads classes through this service). Out of scope is not found.
   */
  async forAttendance(
    db: Pick<TransactionClient, 'classSession'>,
    id: string,
    capability: 'attendance.read' | 'attendance.mark',
  ) {
    const row = await db.classSession.findFirst({
      where: { AND: [{ id }, this.scope(capability)] },
      select: { ...SESSION_SELECT, tenantId: true },
    });
    if (!row) throw new DomainError('NOT_FOUND', 'session');
    return row;
  }

  /** The first roll call completes a scheduled class (C-129). */
  async markCompleted(tx: Pick<TransactionClient, 'classSession'>, id: string) {
    await tx.classSession.updateMany({
      where: { id, status: 'SCHEDULED' },
      data: { status: 'COMPLETED' },
    });
  }

  async zone(db: Pick<TransactionClient, 'tenant'> = this.db) {
    const t = await db.tenant.findFirst({ select: { timezone: true } });
    const timeZone = t?.timezone ?? 'Asia/Kolkata';
    return { timeZone, today: localDate(new Date(), timeZone) };
  }

  async list(query: {
    from: string;
    to: string;
    batchId?: string | undefined;
    teacherId?: string | undefined;
    courseId?: string | undefined;
    branchId?: string | undefined;
  }) {
    const { timeZone, today } = await this.zone();
    const [rows, holidays] = await Promise.all([
      this.db.classSession.findMany({
        where: {
          AND: [
            this.scope('timetable.read'),
            { sessionDate: { gte: at(query.from), lte: at(query.to) } },
            query.batchId ? { batchId: query.batchId } : {},
            query.teacherId ? { teacherId: query.teacherId } : {},
            query.courseId ? { batch: { courseId: query.courseId } } : {},
            query.branchId ? { branchId: query.branchId } : {},
          ],
        },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        take: 3000,
        select: SESSION_SELECT,
      }),
      this.db.holiday.findMany({
        where: {
          removedAt: null,
          startDate: { lte: at(query.to) },
          endDate: { gte: at(query.from) },
          ...(query.branchId ? { OR: [{ branchId: null }, { branchId: query.branchId }] } : {}),
        },
        orderBy: { startDate: 'asc' },
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          kind: true,
          branchId: true,
          removedAt: true,
          _count: { select: { sessions: true } },
        },
      }),
    ]);
    return {
      from: query.from,
      to: query.to,
      today,
      items: rows.map((r) => toSession(r, timeZone)),
      holidays: holidays.map((h) => ({
        id: h.id,
        name: h.name,
        startDate: h.startDate.toISOString().slice(0, 10),
        endDate: h.endDate.toISOString().slice(0, 10),
        kind: h.kind,
        branchId: h.branchId,
        removedAt: null,
        cancelledSessions: h._count.sessions,
      })),
    };
  }

  /** An extra class, or a make-up for a cancelled one (C-115). */
  async create(input: {
    batchId: string;
    date: string;
    start: string;
    end: string;
    teacherId?: string | null | undefined;
    makeupForSessionId?: string | undefined;
    note?: string | undefined;
  }) {
    const id = newId();
    const { timeZone } = await this.zone();
    await this.db.$transaction(async (tx) => {
      const batch = await this.manageableBatch(tx, input.batchId);
      if (batch.status !== 'ACTIVE')
        throw new DomainError('INVALID_STATE_TRANSITION', 'batch archived', [
          { path: 'batchId', issue: 'archived' },
        ]);
      const startsAt = zonedInstant(input.date, timeToMinutes(input.start), timeZone);
      if (startsAt.getTime() <= Date.now())
        throw new DomainError('VALIDATION_FAILED', 'in the past', [
          { path: 'date', issue: 'in_past' },
        ]);
      if (input.makeupForSessionId) {
        const original = await tx.classSession.findFirst({
          where: { id: input.makeupForSessionId, batchId: batch.id, status: 'CANCELLED' },
          select: { id: true },
        });
        if (!original)
          throw new DomainError('VALIDATION_FAILED', 'make-up needs a cancelled class', [
            { path: 'makeupForSessionId', issue: 'not_cancelled' },
          ]);
      }
      if (input.teacherId) await this.activeTeacher(tx, input.teacherId);
      const teacherId =
        input.teacherId !== undefined ? input.teacherId : await this.primaryTeacher(tx, batch.id);
      await tx.classSession.create({
        data: {
          id,
          tenantId: batch.tenantId,
          branchId: batch.branchId,
          batchId: batch.id,
          teacherId,
          sessionDate: at(input.date),
          startsAt,
          endsAt: zonedInstant(input.date, timeToMinutes(input.end), timeZone),
          origin: 'MANUAL',
          makeupForSessionId: input.makeupForSessionId ?? null,
          note: input.note ?? null,
          modifiedAt: new Date(),
        },
      });
      await this.analytics.track(tx, 'session.added', {
        kind: input.makeupForSessionId ? 'makeup' : 'adhoc',
      });
    });
    return this.result(id, timeZone);
  }

  /** Move a class, change its teacher or note. Only classes that haven't started. */
  async update(
    id: string,
    input: {
      version: number;
      date?: string | undefined;
      start?: string | undefined;
      end?: string | undefined;
      teacherId?: string | null | undefined;
      note?: string | null | undefined;
    },
  ) {
    const { timeZone } = await this.zone();
    await this.db.$transaction(async (tx) => {
      const row = await this.manageable(tx, id);
      if (row.status !== 'SCHEDULED')
        throw new DomainError('INVALID_STATE_TRANSITION', `session ${row.status}`, [
          { path: 'status', issue: row.status.toLowerCase() },
        ]);
      if (input.teacherId) await this.activeTeacher(tx, input.teacherId);
      const date = input.date ?? row.sessionDate.toISOString().slice(0, 10);
      const start = input.start ?? localTime(row.startsAt, timeZone);
      const end = input.end ?? localTime(row.endsAt, timeZone);
      if (end <= start)
        throw new DomainError('VALIDATION_FAILED', 'end before start', [
          { path: 'end', issue: 'end_before_start' },
        ]);
      const startsAt = zonedInstant(date, timeToMinutes(start), timeZone);
      const moved =
        input.date !== undefined || input.start !== undefined || input.end !== undefined;
      if (moved && startsAt.getTime() <= Date.now())
        throw new DomainError('VALIDATION_FAILED', 'in the past', [
          { path: 'date', issue: 'in_past' },
        ]);
      const updated = await tx.classSession.updateMany({
        where: { id, version: input.version },
        data: {
          sessionDate: at(date),
          startsAt,
          endsAt: zonedInstant(date, timeToMinutes(end), timeZone),
          ...(input.teacherId !== undefined ? { teacherId: input.teacherId } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          modifiedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
      if (moved) await this.analytics.track(tx, 'session.rescheduled', {});
    });
    return this.result(id, timeZone);
  }

  async cancel(
    id: string,
    input: { version: number; reason: 'TEACHER_UNAVAILABLE' | 'OTHER'; note?: string | undefined },
  ) {
    const { timeZone } = await this.zone();
    await this.db.$transaction(async (tx) => {
      const row = await this.manageable(tx, id);
      if (row.status !== 'SCHEDULED')
        throw new DomainError('INVALID_STATE_TRANSITION', `session ${row.status}`, [
          { path: 'status', issue: row.status.toLowerCase() },
        ]);
      const updated = await tx.classSession.updateMany({
        where: { id, version: input.version },
        data: {
          status: 'CANCELLED',
          cancelReason: input.reason,
          cancelledAt: new Date(),
          cancelledById: this.cls.get('membership')?.id ?? null,
          ...(input.note !== undefined ? { note: input.note } : {}),
          modifiedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
      await this.analytics.track(tx, 'session.cancelled', { reason: input.reason });
    });
    return this.result(id, timeZone);
  }

  /** Undo a cancellation. Holiday cancellations are undone by removing the holiday (C-115). */
  async restore(id: string, input: { version: number }) {
    const { timeZone } = await this.zone();
    await this.db.$transaction(async (tx) => {
      const row = await this.manageable(tx, id);
      if (row.status !== 'CANCELLED')
        throw new DomainError('INVALID_STATE_TRANSITION', `session ${row.status}`);
      if (row.cancelReason === 'HOLIDAY')
        throw new DomainError('CONFLICT', 'cancelled by a holiday', [
          { path: 'holiday', issue: 'remove_holiday' },
        ]);
      const updated = await tx.classSession.updateMany({
        where: { id, version: input.version },
        data: {
          status: 'SCHEDULED',
          cancelReason: null,
          cancelledAt: null,
          cancelledById: null,
          modifiedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
    });
    return this.result(id, timeZone);
  }

  /** Other classes the same teachers have at overlapping times (warnings, never refusals). */
  async doubleBookings(
    db: Pick<TransactionClient, 'classSession'>,
    sessions: {
      id: string;
      batchId: string;
      teacherId: string | null;
      startsAt: Date;
      endsAt: Date;
    }[],
    timeZone: string,
  ): Promise<DoubleBooking[]> {
    const withTeacher = sessions.filter((s) => s.teacherId);
    if (!withTeacher.length) return [];
    const min = new Date(Math.min(...withTeacher.map((s) => s.startsAt.getTime())));
    const max = new Date(Math.max(...withTeacher.map((s) => s.endsAt.getTime())));
    const others = await db.classSession.findMany({
      where: {
        teacherId: { in: [...new Set(withTeacher.map((s) => s.teacherId!))] },
        status: 'SCHEDULED',
        startsAt: { lt: max },
        endsAt: { gt: min },
        id: { notIn: withTeacher.map((s) => s.id) },
      },
      select: {
        id: true,
        batchId: true,
        teacherId: true,
        startsAt: true,
        endsAt: true,
        sessionDate: true,
        batch: { select: { name: true } },
        teacher: { select: { fullName: true } },
      },
      take: 500,
    });
    const out: DoubleBooking[] = [];
    for (const s of withTeacher)
      for (const o of others)
        if (
          o.teacherId === s.teacherId &&
          o.batchId !== s.batchId &&
          o.startsAt < s.endsAt &&
          s.startsAt < o.endsAt
        )
          out.push({
            sessionId: s.id,
            teacherName: o.teacher?.fullName ?? '',
            date: o.sessionDate.toISOString().slice(0, 10),
            start: localTime(o.startsAt, timeZone),
            end: localTime(o.endsAt, timeZone),
            otherBatchName: o.batch.name,
          });
    return out;
  }

  // ── helpers ──────────────────────────────────────────────────────────────────────────────

  private async result(id: string, timeZone: string) {
    const row = await this.db.classSession.findFirst({ where: { id }, select: SESSION_SELECT });
    if (!row) throw new DomainError('NOT_FOUND', 'session');
    return {
      session: toSession(row, timeZone),
      doubleBookings:
        row.status === 'SCHEDULED' ? await this.doubleBookings(this.db, [row], timeZone) : [],
    };
  }

  /** A session in scope for `session.manage` that hasn't started yet. */
  private async manageable(tx: TransactionClient, id: string) {
    const row = await tx.classSession.findFirst({
      where: { AND: [{ id }, this.scope('session.manage')] },
      select: {
        id: true,
        status: true,
        cancelReason: true,
        sessionDate: true,
        startsAt: true,
        endsAt: true,
      },
    });
    if (!row) throw new DomainError('NOT_FOUND', 'session');
    if (row.startsAt.getTime() <= Date.now())
      throw new DomainError('INVALID_STATE_TRANSITION', 'already started', [
        { path: 'startsAt', issue: 'started' },
      ]);
    return row;
  }

  /** The batch, if the caller may manage its classes (`session.manage` scope on batches). */
  private async manageableBatch(tx: TransactionClient, batchId: string) {
    const batch = await tx.batch.findFirst({
      where: {
        AND: [
          { id: batchId },
          scopedWhere(this.cls, 'session.manage', batchPolicy) as Prisma.BatchWhereInput,
        ],
      },
      select: { id: true, tenantId: true, branchId: true, status: true },
    });
    if (!batch) throw new DomainError('NOT_FOUND', 'batch');
    return batch;
  }

  /** A class's teacher is a current teacher of this academy (review M3): else not found. */
  private async activeTeacher(tx: TransactionClient, teacherId: string) {
    const found = await tx.teacher.findFirst({
      where: { id: teacherId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!found) throw new DomainError('NOT_FOUND', 'teacher');
  }

  private async primaryTeacher(tx: TransactionClient, batchId: string): Promise<string | null> {
    const t = await tx.batchTeacher.findFirst({
      where: { batchId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: { teacherId: true },
    });
    return t?.teacherId ?? null;
  }

  /** Activity on the batch timeline for schedule changes. */
  async recordBatch(
    tx: TransactionClient,
    tenantId: string,
    batchId: string,
    data: Record<string, string | number>,
  ) {
    await this.activity.record(tx, {
      tenantId,
      entityType: 'BATCH',
      entityId: batchId,
      type: 'batch.updated',
      data,
    });
  }
}
