import {
  addDays,
  type AttendanceConflict,
  type AttendanceCounts,
  type AttendanceMark,
  type AttendanceStatus,
  isoWeekday,
  localDate,
  type MarkSessionInput,
  newId,
  type SessionAttendance,
} from '@academybee/contracts';
import type { Prisma, TenantBoundClient, TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { AnalyticsService } from '../../core/analytics/analytics.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { EnrolmentsService, StudentsService } from '../people/index.js';
import { attends, BatchesService, localTime, SessionsService } from '../scheduling/index.js';
import { decide, editableUntil, lockFor, percentOf } from './domain/rules.js';

const day = (d: Date) => d.toISOString().slice(0, 10);
const at = (d: string) => new Date(`${d}T00:00:00Z`);

const MARK_SELECT = {
  id: true,
  studentId: true,
  status: true,
  note: true,
  version: true,
  markedAt: true,
  markedById: true,
  markedBy: { select: { user: { select: { name: true } } } },
} satisfies Prisma.AttendanceSelect;
type MarkRow = Prisma.AttendanceGetPayload<{ select: typeof MARK_SELECT }>;

const toMark = (r: MarkRow): AttendanceMark => ({
  id: r.id,
  status: r.status,
  note: r.note,
  version: r.version,
  markedAt: r.markedAt.toISOString(),
  markedByName: r.markedBy.user.name,
});

const emptyCounts = (): AttendanceCounts => ({
  PRESENT: 0,
  ABSENT: 0,
  LATE: 0,
  LEAVE: 0,
  unmarked: 0,
});

export type MarkSource = { source: 'online' | 'sync'; opId?: string | undefined };
export type MarkResult =
  { status: 'APPLIED'; changed: number } | { status: 'CONFLICT'; conflicts: AttendanceConflict[] };

/** Enrolments of one batch → is a student expected on `date` (C-120)? */
type EnrolmentSpan = {
  studentId: string;
  startedOn: string;
  endedOn: string | null;
  weekdays: number[];
};
function expectedIds(spans: readonly EnrolmentSpan[], date: string): Set<string> {
  const weekday = isoWeekday(date);
  return new Set(
    spans
      .filter(
        (e) =>
          e.startedOn <= date && (!e.endedOn || e.endedOn >= date) && attends(e.weekdays, weekday),
      )
      .map((e) => e.studentId),
  );
}

/**
 * Attendance (Phase 6; ADR-017, C-126…C-131): one mark per class and student, saved for the whole
 * class atomically, with the conflict rule, edit windows, history, parent intents (stored, sent
 * from 7P) and the class completed on its first roll call. The REST API and the sync queue both
 * come through `markSession`.
 */
@Injectable()
export class AttendanceService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly sessions: SessionsService,
    private readonly batches: BatchesService,
    private readonly enrolments: EnrolmentsService,
    private readonly students: StudentsService,
    private readonly analytics: AnalyticsService,
  ) {}

  private me(): string {
    const membership = this.cls.get('membership');
    if (!membership) throw new DomainError('FORBIDDEN', 'no membership');
    return membership.id;
  }
  private canEditPast(): boolean {
    return this.cls.get('membership')?.capabilities['attendance.edit_past'] !== undefined;
  }

  /** The roll call for one class: who is expected, their marks and whether it can change now. */
  async forSession(sessionId: string): Promise<SessionAttendance> {
    const { timeZone, today } = await this.sessions.zone();
    const session = await this.sessions.forAttendance(this.db, sessionId, 'attendance.read');
    const date = day(session.sessionDate);
    const [expected, marks] = await Promise.all([
      this.enrolments.expectedOn(this.db, session.batchId, date),
      this.db.attendance.findMany({
        where: { sessionId },
        select: { ...MARK_SELECT, student: { select: { fullName: true, admissionNo: true } } },
      }),
    ]);
    const byStudent = new Map(marks.map((m) => [m.studentId, m]));
    const expectedSet = new Set(expected.map((e) => e.studentId));
    const students = [
      ...expected.map((e) => ({ ...e, expected: true })),
      // Marked earlier but no longer on the roll that day (moved, left): kept, never hidden.
      ...marks
        .filter((m) => !expectedSet.has(m.studentId))
        .map((m) => ({
          studentId: m.studentId,
          fullName: m.student.fullName,
          admissionNo: m.student.admissionNo,
          expected: false,
        })),
    ].map((s) => {
      const m = byStudent.get(s.studentId);
      return { ...s, attendance: m ? toMark(m) : null };
    });
    const counts = emptyCounts();
    for (const s of students)
      if (s.attendance) counts[s.attendance.status] += 1;
      else if (s.expected) counts.unmarked += 1;
    const canEditPast = this.canEditPast();
    return {
      session: {
        id: session.id,
        batchId: session.batchId,
        batchName: session.batch.name,
        date,
        start: localTime(session.startsAt, timeZone),
        end: localTime(session.endsAt, timeZone),
        startsAt: session.startsAt.toISOString(),
        endsAt: session.endsAt.toISOString(),
        status: session.status,
        teacherName: session.teacher?.fullName ?? null,
      },
      locked: lockFor(
        { status: session.status, date, endsAt: session.endsAt },
        { now: new Date(), today, timeZone },
        { source: 'online', canEditPast },
      ),
      editableUntil: canEditPast
        ? null
        : editableUntil({ date, endsAt: session.endsAt }, 'online', timeZone).toISOString(),
      students,
      counts,
    };
  }

  /**
   * Save a roll call (C-126): every mark applies, or — if any conflicts with someone else's
   * newer value (ADR-017) — none does and the conflicts come back for the user to choose.
   */
  markSession(sessionId: string, input: MarkSessionInput, from: MarkSource): Promise<MarkResult> {
    return this.db.$transaction((tx) => this.markSessionIn(tx, sessionId, input, from));
  }

  /** `markSession` inside the caller's transaction (the sync push writes its ledger row with it). */
  async markSessionIn(
    tx: TransactionClient,
    sessionId: string,
    input: MarkSessionInput,
    from: MarkSource,
  ): Promise<MarkResult> {
    const me = this.me();
    const { timeZone, today } = await this.sessions.zone(tx);
    const session = await this.sessions.forAttendance(tx, sessionId, 'attendance.mark');
    const date = day(session.sessionDate);
    const lock = lockFor(
      { status: session.status, date, endsAt: session.endsAt },
      { now: new Date(), today, timeZone },
      { source: from.source, canEditPast: this.canEditPast() },
    );
    if (lock)
      throw new DomainError('INVALID_STATE_TRANSITION', `attendance ${lock}`, [
        { path: 'session', issue: lock },
      ]);
    // One roll call at a time per class: updating the class row locks it until commit, so
    // concurrent saves (two devices, retries) run one after the other.
    await tx.classSession.updateMany({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });
    const [expected, existing] = await Promise.all([
      this.enrolments.expectedOn(tx, session.batchId, date),
      tx.attendance.findMany({ where: { sessionId }, select: MARK_SELECT }),
    ]);
    const onRoll = new Set(expected.map((e) => e.studentId));
    const current = new Map(existing.map((m) => [m.studentId, m]));
    input.marks.forEach((m, i) => {
      if (!onRoll.has(m.studentId) && !current.has(m.studentId))
        throw new DomainError('VALIDATION_FAILED', 'not on the roll', [
          { path: `marks.${i}.studentId`, issue: 'not_on_roll' },
        ]);
    });
    const decisions = input.marks.map((m) => {
      const row = current.get(m.studentId) ?? null;
      return { m, row, decision: decide(row, m, me) };
    });
    const conflicts = decisions
      .filter((d) => d.decision === 'conflict')
      .map((d) => ({ studentId: d.m.studentId, server: toMark(d.row!) }));
    if (conflicts.length) return { status: 'CONFLICT', conflicts };

    // Writes are set-based so a 60-student class is a handful of statements, not hundreds.
    const now = new Date();
    const todo = decisions
      .filter((d) => d.decision !== 'noop')
      .map((d) => ({
        ...d,
        id: d.row?.id ?? newId(),
        note: d.m.note === undefined ? (d.row?.note ?? null) : d.m.note,
      }));
    const changed = todo.length;
    const created = todo.filter((d) => d.decision === 'create');
    if (created.length)
      await tx.attendance.createMany({
        data: created.map((d) => ({
          id: d.id,
          tenantId: session.tenantId,
          branchId: session.branchId,
          batchId: session.batchId,
          sessionId,
          studentId: d.m.studentId,
          sessionDate: session.sessionDate,
          status: d.m.status,
          note: d.note,
          markedById: me,
          markedAt: now,
        })),
      });
    for (const d of todo.filter((x) => x.decision === 'apply'))
      await tx.attendance.update({
        where: { id: d.id },
        data: {
          status: d.m.status,
          note: d.note,
          markedById: me,
          markedAt: now,
          version: { increment: 1 },
        },
      });
    const moved = todo.filter((d) => d.row?.status !== d.m.status);
    if (moved.length)
      await tx.attendanceChange.createMany({
        data: moved.map((d) => ({
          id: newId(),
          tenantId: session.tenantId,
          attendanceId: d.id,
          fromStatus: d.row?.status ?? null,
          toStatus: d.m.status,
          changedById: me,
          opId: from.opId ?? null,
        })),
      });
    if (moved.length)
      await this.intents(
        tx,
        session,
        moved.map((d) => ({ studentId: d.m.studentId, status: d.m.status })),
        timeZone,
      );
    if (changed) await this.sessions.markCompleted(tx, sessionId);
    await this.analytics.track(tx, 'attendance.marked', {
      students: input.marks.length,
      exceptions: input.marks.filter((m) => m.status !== 'PRESENT').length,
      changed,
      source: from.source,
    });
    return { status: 'APPLIED', changed };
  }

  /**
   * Parent notices (C-128): one pending intent per absence or late arrival, written with the
   * attendance so it exists only if the roll call committed; a correction voids the pending one.
   * Delivery starts in 7P (hub) and Phase 10 (channels).
   */
  private async intents(
    tx: TransactionClient,
    session: { id: string; tenantId: string; startsAt: Date; batch: { name: string } },
    marks: { studentId: string; status: AttendanceStatus }[],
    timeZone: string,
  ) {
    const kinds = { ABSENT: 'ATTENDANCE_ABSENT', LATE: 'ATTENDANCE_LATE' } as const;
    const wanted = (k: 'ATTENDANCE_ABSENT' | 'ATTENDANCE_LATE') =>
      marks.filter((m) => m.status in kinds && kinds[m.status as 'ABSENT' | 'LATE'] === k);
    for (const kind of ['ATTENDANCE_ABSENT', 'ATTENDANCE_LATE'] as const) {
      const keep = wanted(kind).map((m) => m.studentId);
      const others = marks.map((m) => m.studentId).filter((id) => !keep.includes(id));
      if (others.length)
        await tx.notificationIntent.updateMany({
          where: { sessionId: session.id, kind, status: 'PENDING', studentId: { in: others } },
          data: { status: 'VOID' },
        });
      if (!keep.length) continue;
      // Bring back a notice voided by an earlier correction, then add the missing ones.
      await tx.notificationIntent.updateMany({
        where: { sessionId: session.id, kind, status: 'VOID', studentId: { in: keep } },
        data: { status: 'PENDING' },
      });
      const payload = {
        date: localDate(session.startsAt, timeZone),
        start: localTime(session.startsAt, timeZone),
        batchName: session.batch.name,
      };
      await tx.notificationIntent.createMany({
        data: keep.map((studentId) => ({
          id: newId(),
          tenantId: session.tenantId,
          kind,
          studentId,
          sessionId: session.id,
          payload,
        })),
        skipDuplicates: true,
      });
    }
  }

  /** Correct one mark (`PATCH /attendance/:id`): the same rule, from the version the user saw. */
  async update(
    id: string,
    input: { version: number; status: AttendanceStatus; note?: string | null | undefined },
  ): Promise<MarkResult & { sessionId: string }> {
    const row = await this.db.attendance.findFirst({
      where: { AND: [{ id }, { session: this.sessions.scope('attendance.mark') }] },
      select: { sessionId: true, studentId: true },
    });
    if (!row) throw new DomainError('NOT_FOUND', 'attendance');
    const result = await this.markSession(
      row.sessionId,
      {
        marks: [
          {
            studentId: row.studentId,
            status: input.status,
            ...(input.note !== undefined ? { note: input.note } : {}),
            baseVersion: input.version,
          },
        ],
      },
      { source: 'online' },
    );
    return { ...result, sessionId: row.sessionId };
  }

  /** A student's monthly percentages and recent marks, within the caller's class scope. */
  async forStudent(studentId: string, months: number) {
    await this.students.assertReadable(studentId);
    const { today } = await this.sessions.zone();
    const first = `${today.slice(0, 7)}-01`;
    let start = first;
    for (let i = 1; i < months; i++) start = `${addDays(start, -1).slice(0, 7)}-01`;
    const rows = await this.db.attendance.findMany({
      where: {
        studentId,
        sessionDate: { gte: at(start) },
        session: this.sessions.scope('attendance.read'),
      },
      orderBy: [{ sessionDate: 'desc' }, { id: 'desc' }],
      take: 2000,
      select: {
        id: true,
        sessionId: true,
        batchId: true,
        sessionDate: true,
        status: true,
        note: true,
        batch: { select: { name: true } },
      },
    });
    const byMonth = new Map<
      string,
      { PRESENT: number; ABSENT: number; LATE: number; LEAVE: number }
    >();
    for (let m = start; m <= first; m = `${addDays(m, 32).slice(0, 7)}-01`)
      byMonth.set(m.slice(0, 7), { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 });
    for (const r of rows) {
      const bucket = byMonth.get(day(r.sessionDate).slice(0, 7));
      if (bucket) bucket[r.status] += 1;
    }
    return {
      months: [...byMonth.entries()].reverse().map(([month, c]) => ({
        month,
        present: c.PRESENT,
        absent: c.ABSENT,
        late: c.LATE,
        leave: c.LEAVE,
        percent: percentOf(c),
      })),
      items: rows.slice(0, 60).map((r) => ({
        id: r.id,
        sessionId: r.sessionId,
        batchId: r.batchId,
        batchName: r.batch.name,
        date: day(r.sessionDate),
        status: r.status,
        note: r.note,
      })),
    };
  }

  /** A batch's classes in a range with their counts and the overall percentage. */
  async forBatch(batchId: string, from: string, to: string) {
    await this.batches.find(this.db, batchId, 'batch.read');
    const [list, spans] = await Promise.all([
      this.sessions.list({ from, to, batchId }),
      this.enrolments.between(this.db, [batchId], from, to),
    ]);
    const counts = await this.countsFor(list.items.map((s) => s.id));
    const totals = { PRESENT: 0, ABSENT: 0, LATE: 0 };
    const sessions = list.items.map((s) => {
      const c = { ...emptyCounts(), ...counts.get(s.id) };
      const marked = c.PRESENT + c.ABSENT + c.LATE + c.LEAVE;
      const expected = expectedIds(spans, s.date).size;
      c.unmarked = s.status === 'CANCELLED' ? 0 : Math.max(0, expected - marked);
      totals.PRESENT += c.PRESENT;
      totals.ABSENT += c.ABSENT;
      totals.LATE += c.LATE;
      return { sessionId: s.id, date: s.date, start: s.start, status: s.status, counts: c };
    });
    return { sessions, percent: percentOf(totals) };
  }

  /** Roll calls on one academy day by class (Owner Today, the overview, G-16). */
  async overview(date?: string) {
    const { today } = await this.sessions.zone();
    const on = date ?? today;
    const list = await this.sessions.list({ from: on, to: on });
    const batchIds = [...new Set(list.items.map((s) => s.batchId))];
    const [counts, spans] = await Promise.all([
      this.countsFor(list.items.map((s) => s.id)),
      this.enrolments.between(this.db, batchIds, on, on),
    ]);
    const now = Date.now();
    const sessions = list.items.map((s) => {
      const c = { ...emptyCounts(), ...counts.get(s.id) };
      const marked = c.PRESENT + c.ABSENT + c.LATE + c.LEAVE;
      const expected = expectedIds(
        spans.filter((e) => e.batchId === s.batchId),
        on,
      ).size;
      c.unmarked = s.status === 'CANCELLED' ? 0 : Math.max(0, expected - marked);
      const state =
        s.status === 'CANCELLED'
          ? ('cancelled' as const)
          : marked > 0 || s.status === 'COMPLETED'
            ? ('taken' as const)
            : Date.parse(s.endsAt) < now
              ? ('due' as const)
              : ('later' as const);
      return {
        sessionId: s.id,
        batchId: s.batchId,
        batchName: s.batchName,
        start: s.start,
        end: s.end,
        endsAt: s.endsAt,
        teacherName: s.teacherName,
        state,
        counts: c,
      };
    });
    const totals = { taken: 0, due: 0, later: 0 };
    for (const s of sessions) if (s.state !== 'cancelled') totals[s.state] += 1;
    return { date: on, sessions, totals };
  }

  private async countsFor(sessionIds: string[]) {
    const out = new Map<string, Partial<AttendanceCounts>>();
    if (!sessionIds.length) return out;
    const groups = await this.db.attendance.groupBy({
      by: ['sessionId', 'status'],
      where: { sessionId: { in: sessionIds } },
      _count: { _all: true },
    });
    for (const g of groups) {
      const c = out.get(g.sessionId) ?? {};
      c[g.status] = g._count._all;
      out.set(g.sessionId, c);
    }
    return out;
  }
}
