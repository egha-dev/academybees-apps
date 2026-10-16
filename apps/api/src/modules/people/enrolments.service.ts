import { addDays, CAPACITY_ISSUE, type Enrolment, isoWeekday, newId } from '@academybee/contracts';
import type { Prisma, TenantBoundClient, TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { ActivityService } from '../../core/activity/activity.service.js';
import { AnalyticsService } from '../../core/analytics/analytics.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { scopedWhere } from '../../core/rbac/scope.js';
import { attends, BatchesService, batchLoads, overCapacity } from '../scheduling/index.js';
import { studentPolicy } from './people.policy.js';

const at = (d: string) => new Date(`${d}T00:00:00Z`);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Students in batches over time (PRD v3 §9 time-aware membership, G-27, C-120, C-122): roster on a
 * date, enrol with a day plan and a per-day capacity check, change days from a date, leave, and
 * transfer. Enrolments are never deleted: a change ends one row and starts another (ADR-025), so
 * past classes keep the students who were in them.
 */
@Injectable()
export class EnrolmentsService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly batches: BatchesService,
    private readonly activity: ActivityService,
    private readonly analytics: AnalyticsService,
  ) {}

  private studentScope(capability: 'student.read' | 'student.update'): Prisma.StudentWhereInput {
    return scopedWhere(this.cls, capability, studentPolicy);
  }

  /** Students in the batch on a date (default today), with their day plans. */
  /**
   * Students expected at a batch's class on `date` (C-120): enrolled that day and the weekday is in
   * their day plan. Used by attendance for the roll call (C-122: people owns enrolments).
   */
  async expectedOn(
    db: Pick<TransactionClient, 'batchEnrolment'>,
    batchId: string,
    date: string,
  ): Promise<{ studentId: string; fullName: string; admissionNo: string | null }[]> {
    const rows = await db.batchEnrolment.findMany({
      where: {
        batchId,
        startedOn: { lte: at(date) },
        OR: [{ endedOn: null }, { endedOn: { gte: at(date) } }],
      },
      orderBy: [{ student: { fullName: 'asc' } }, { id: 'asc' }],
      take: 2000,
      select: {
        studentId: true,
        weekdays: true,
        student: { select: { fullName: true, admissionNo: true } },
      },
    });
    const weekday = isoWeekday(date);
    const seen = new Set<string>();
    return rows
      .filter(
        (r) => attends(r.weekdays, weekday) && !seen.has(r.studentId) && seen.add(r.studentId),
      )
      .map((r) => ({
        studentId: r.studentId,
        fullName: r.student.fullName,
        admissionNo: r.student.admissionNo,
      }));
  }

  /**
   * A device's offline working set (Phase 6): enrolments of these batches still open on `from`,
   * and their students' basic profile only (no contacts, no health notes; PRD v2.1 §18.8),
   * within the caller's student scope.
   */
  async workingSet(batchIds: readonly string[], from: string) {
    if (!batchIds.length) return { enrolments: [], students: [] };
    const rows = await this.db.batchEnrolment.findMany({
      where: {
        batchId: { in: [...batchIds] },
        OR: [{ endedOn: null }, { endedOn: { gte: at(from) } }],
        student: this.studentScope('student.read'),
      },
      orderBy: [{ id: 'asc' }],
      take: 20_000,
      select: {
        id: true,
        batchId: true,
        studentId: true,
        startedOn: true,
        endedOn: true,
        weekdays: true,
        student: { select: { fullName: true, admissionNo: true, status: true } },
      },
    });
    const students = new Map<
      string,
      { id: string; fullName: string; admissionNo: string | null; status: string }
    >();
    for (const r of rows) students.set(r.studentId, { id: r.studentId, ...r.student });
    return {
      enrolments: rows.map((r) => ({
        id: r.id,
        batchId: r.batchId,
        studentId: r.studentId,
        startedOn: r.startedOn.toISOString().slice(0, 10),
        endedOn: r.endedOn ? r.endedOn.toISOString().slice(0, 10) : null,
        weekdays: r.weekdays,
      })),
      students: [...students.values()],
    };
  }

  /** Enrolments of some batches overlapping a date range, for expected counts per class. */
  async between(
    db: Pick<TransactionClient, 'batchEnrolment'>,
    batchIds: readonly string[],
    from: string,
    to: string,
  ): Promise<
    {
      batchId: string;
      studentId: string;
      startedOn: string;
      endedOn: string | null;
      weekdays: number[];
    }[]
  > {
    if (!batchIds.length) return [];
    const rows = await db.batchEnrolment.findMany({
      where: {
        batchId: { in: [...batchIds] },
        startedOn: { lte: at(to) },
        OR: [{ endedOn: null }, { endedOn: { gte: at(from) } }],
      },
      select: { batchId: true, studentId: true, startedOn: true, endedOn: true, weekdays: true },
    });
    return rows.map((r) => ({
      batchId: r.batchId,
      studentId: r.studentId,
      startedOn: r.startedOn.toISOString().slice(0, 10),
      endedOn: r.endedOn ? r.endedOn.toISOString().slice(0, 10) : null,
      weekdays: r.weekdays,
    }));
  }

  async roster(batchId: string, on?: string) {
    await this.batches.find(this.db, batchId, 'batch.read');
    const date = on ?? (await this.batches.today());
    const [rows, loads] = await Promise.all([
      this.db.batchEnrolment.findMany({
        where: {
          batchId,
          startedOn: { lte: at(date) },
          OR: [{ endedOn: null }, { endedOn: { gte: at(date) } }],
          student: this.studentScope('student.read'),
        },
        orderBy: [{ student: { fullName: 'asc' } }, { id: 'asc' }],
        take: 2000,
        select: {
          id: true,
          batchId: true,
          studentId: true,
          startedOn: true,
          endedOn: true,
          weekdays: true,
          student: { select: { fullName: true, admissionNo: true, status: true } },
        },
      }),
      batchLoads(this.db, [batchId], date),
    ]);
    const batchWeekdays = loads.get(batchId)!.weekdays;
    return {
      on: date,
      batchWeekdays,
      items: rows.map((r) => this.toEnrolment(r, batchWeekdays)),
    };
  }

  private toEnrolment(
    r: {
      id: string;
      batchId: string;
      studentId: string;
      startedOn: Date;
      endedOn: Date | null;
      weekdays: number[];
      student: { fullName: string; admissionNo: string; status: Enrolment['studentStatus'] };
    },
    batchWeekdays: number[],
  ): Enrolment {
    return {
      id: r.id,
      batchId: r.batchId,
      studentId: r.studentId,
      studentName: r.student.fullName,
      admissionNo: r.student.admissionNo,
      studentStatus: r.student.status,
      startedOn: day(r.startedOn)!,
      endedOn: day(r.endedOn),
      weekdays: r.weekdays,
      classesPerWeek: batchWeekdays.filter((w) => attends(r.weekdays, w)).length,
    };
  }

  async enrol(
    batchId: string,
    input: {
      studentId: string;
      startedOn?: string | undefined;
      weekdays: number[];
      confirmOverCapacity: boolean;
    },
  ): Promise<Enrolment> {
    const id = await this.db.$transaction(async (tx) => {
      const batch = await this.batches.find(tx, batchId, 'batch.enrol');
      if (batch.status !== 'ACTIVE')
        throw new DomainError('INVALID_STATE_TRANSITION', 'batch archived', [
          { path: 'batchId', issue: 'archived' },
        ]);
      const student = await this.student(tx, input.studentId);
      const startedOn = input.startedOn ?? (await this.batches.today(tx));
      const created = await this.start(tx, {
        tenantId: batch.tenantId,
        batchId,
        capacity: batch.capacity,
        studentId: student.id,
        startedOn,
        weekdays: input.weekdays,
        confirm: input.confirmOverCapacity,
      });
      await this.analytics.track(tx, 'enrolment.created', {
        dayPlan: input.weekdays.length ? 'some' : 'all',
        overCapacity: input.confirmOverCapacity,
      });
      return created;
    });
    return this.one(id);
  }

  /** Change a student's days from a date (C-120): end the current enrolment, start a new one. */
  async changeDays(
    enrolmentId: string,
    input: { from: string; weekdays: number[]; confirmOverCapacity: boolean },
  ): Promise<Enrolment> {
    const id = await this.db.$transaction(async (tx) => {
      const current = await this.openEnrolment(tx, enrolmentId);
      const batch = await this.batches.find(tx, current.batchId, 'batch.enrol');
      if (input.from <= day(current.startedOn)!) {
        // Starting the same day it began: just correct the plan (nothing has happened yet).
        await this.assertCapacity(
          tx,
          batch.id,
          batch.capacity,
          input.from,
          input.weekdays,
          input.confirmOverCapacity,
          current.id,
        );
        await tx.batchEnrolment.update({
          where: { id: current.id },
          data: { weekdays: input.weekdays },
        });
        await this.record(
          tx,
          batch.tenantId,
          current.studentId,
          batch.id,
          'enrolment.days_changed',
          input.weekdays,
        );
        return current.id;
      }
      await tx.batchEnrolment.update({
        where: { id: current.id },
        data: { endedOn: at(addDays(input.from, -1)) },
      });
      return this.start(tx, {
        tenantId: batch.tenantId,
        batchId: batch.id,
        capacity: batch.capacity,
        studentId: current.studentId,
        startedOn: input.from,
        weekdays: input.weekdays,
        confirm: input.confirmOverCapacity,
        activity: 'enrolment.days_changed',
      });
    });
    return this.one(id);
  }

  async end(enrolmentId: string, input: { endedOn: string; reason?: string | undefined }) {
    await this.db.$transaction(async (tx) => {
      const current = await this.openEnrolment(tx, enrolmentId);
      const batch = await this.batches.find(tx, current.batchId, 'batch.enrol');
      if (input.endedOn < day(current.startedOn)!)
        throw new DomainError('VALIDATION_FAILED', 'ends before it started', [
          { path: 'endedOn', issue: 'ends_before_start' },
        ]);
      await tx.batchEnrolment.update({
        where: { id: current.id },
        data: { endedOn: at(input.endedOn) },
      });
      await this.record(tx, batch.tenantId, current.studentId, batch.id, 'enrolment.ended');
      await this.analytics.track(tx, 'enrolment.ended', {});
    });
    return this.one(enrolmentId);
  }

  /** Move to another batch on a date (G-27): the old enrolment ends the day before; history stays. */
  async transfer(
    studentId: string,
    input: {
      fromBatchId: string;
      toBatchId: string;
      date: string;
      weekdays: number[];
      confirmOverCapacity: boolean;
    },
  ): Promise<Enrolment> {
    const id = await this.db.$transaction(async (tx) => {
      const student = await this.student(tx, studentId);
      const from = await this.batches.find(tx, input.fromBatchId, 'batch.enrol');
      const to = await this.batches.find(tx, input.toBatchId, 'batch.enrol');
      if (to.status !== 'ACTIVE')
        throw new DomainError('INVALID_STATE_TRANSITION', 'batch archived', [
          { path: 'toBatchId', issue: 'archived' },
        ]);
      const current = await tx.batchEnrolment.findFirst({
        where: { batchId: from.id, studentId: student.id, endedOn: null },
        select: { id: true, startedOn: true },
      });
      if (!current) throw new DomainError('NOT_FOUND', 'enrolment');
      if (input.date <= day(current.startedOn)!)
        throw new DomainError('VALIDATION_FAILED', 'transfer before the enrolment started', [
          { path: 'date', issue: 'before_start' },
        ]);
      await tx.batchEnrolment.update({
        where: { id: current.id },
        data: { endedOn: at(addDays(input.date, -1)) },
      });
      await this.record(tx, from.tenantId, student.id, from.id, 'student.transferred');
      const newId = await this.start(tx, {
        tenantId: to.tenantId,
        batchId: to.id,
        capacity: to.capacity,
        studentId: student.id,
        startedOn: input.date,
        weekdays: input.weekdays,
        confirm: input.confirmOverCapacity,
        activity: 'student.transferred',
      });
      await this.analytics.track(tx, 'student.transferred', {
        dayPlan: input.weekdays.length ? 'some' : 'all',
      });
      return newId;
    });
    return this.one(id);
  }

  // ── helpers ──────────────────────────────────────────────────────────────────────────────

  private async start(
    tx: TransactionClient,
    input: {
      tenantId: string;
      batchId: string;
      capacity: number | null;
      studentId: string;
      startedOn: string;
      weekdays: number[];
      confirm: boolean;
      activity?: 'enrolment.started' | 'enrolment.days_changed' | 'student.transferred';
    },
  ): Promise<string> {
    const open = await tx.batchEnrolment.findFirst({
      where: { batchId: input.batchId, studentId: input.studentId, endedOn: null },
      select: { id: true },
    });
    if (open)
      throw new DomainError('CONFLICT', 'already in this batch', [
        { path: 'studentId', issue: 'already_enrolled' },
      ]);
    const loads = await batchLoads(tx, [input.batchId], input.startedOn);
    const meets = loads.get(input.batchId)!.weekdays;
    const outside = input.weekdays.filter((w) => meets.length > 0 && !meets.includes(w));
    if (outside.length)
      throw new DomainError(
        'VALIDATION_FAILED',
        'day not in the batch schedule',
        outside.map((w) => ({ path: `weekday.${w}`, issue: 'not_in_schedule' })),
      );
    await this.assertCapacity(
      tx,
      input.batchId,
      input.capacity,
      input.startedOn,
      input.weekdays,
      input.confirm,
    );
    const id = newId();
    await tx.batchEnrolment.create({
      data: {
        id,
        tenantId: input.tenantId,
        batchId: input.batchId,
        studentId: input.studentId,
        startedOn: at(input.startedOn),
        weekdays: input.weekdays,
      },
    });
    await this.record(
      tx,
      input.tenantId,
      input.studentId,
      input.batchId,
      input.activity ?? 'enrolment.started',
      input.weekdays,
    );
    return id;
  }

  private async assertCapacity(
    tx: TransactionClient,
    batchId: string,
    capacity: number | null,
    on: string,
    weekdays: number[],
    confirm: boolean,
    excludeEnrolmentId?: string,
  ): Promise<void> {
    if (confirm || capacity === null) return;
    const load = (
      await batchLoads(tx, [batchId], on, {
        batchId,
        weekdays,
        ...(excludeEnrolmentId ? { excludeEnrolmentId } : {}),
      })
    ).get(batchId)!;
    const over = overCapacity(load, capacity);
    if (over.length)
      throw new DomainError(
        'CONFLICT',
        'over capacity',
        over.map((w) => ({ path: `weekday.${w}`, issue: CAPACITY_ISSUE })),
      );
  }

  private async record(
    tx: TransactionClient,
    tenantId: string,
    studentId: string,
    batchId: string,
    type:
      'enrolment.started' | 'enrolment.days_changed' | 'enrolment.ended' | 'student.transferred',
    weekdays?: number[],
  ): Promise<void> {
    const data = { batchId, ...(weekdays ? { weekdays: weekdays.join(',') } : {}) };
    await this.activity.record(tx, {
      tenantId,
      entityType: 'STUDENT',
      entityId: studentId,
      type,
      data,
    });
    await this.activity.record(tx, {
      tenantId,
      entityType: 'BATCH',
      entityId: batchId,
      type,
      data: { studentId },
    });
  }

  private async student(tx: TransactionClient, id: string) {
    const student = await tx.student.findFirst({
      where: { AND: [{ id, archivedAt: null }, this.studentScope('student.read')] },
      select: { id: true },
    });
    if (!student) throw new DomainError('NOT_FOUND', 'student');
    return student;
  }

  private async openEnrolment(tx: TransactionClient, id: string) {
    const e = await tx.batchEnrolment.findFirst({
      where: { id, endedOn: null, student: this.studentScope('student.read') },
      select: { id: true, batchId: true, studentId: true, startedOn: true },
    });
    if (!e) throw new DomainError('NOT_FOUND', 'enrolment');
    return e;
  }

  private async one(id: string): Promise<Enrolment> {
    const r = await this.db.batchEnrolment.findFirst({
      where: { id },
      select: {
        id: true,
        batchId: true,
        studentId: true,
        startedOn: true,
        endedOn: true,
        weekdays: true,
        student: { select: { fullName: true, admissionNo: true, status: true } },
      },
    });
    if (!r) throw new DomainError('NOT_FOUND', 'enrolment');
    const on = day(r.endedOn) ?? (await this.batches.today());
    const meets = (
      await batchLoads(this.db, [r.batchId], on < day(r.startedOn)! ? day(r.startedOn)! : on)
    ).get(r.batchId)!.weekdays;
    return this.toEnrolment(r, meets);
  }
}
