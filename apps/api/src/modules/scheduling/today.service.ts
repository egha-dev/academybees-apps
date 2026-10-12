import { addDays, isoWeekday, type Today } from '@academybee/contracts';
import type { Prisma, TenantBoundClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';

import { TENANT_DB } from '../../core/database/database.module.js';
import { batchLoads, overCapacity } from './batch-load.js';
import { BatchesService } from './batches.service.js';
import { SESSION_SELECT, SessionsService, toSession } from './sessions.service.js';

const at = (d: string) => new Date(`${d}T00:00:00Z`);
const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Owner Today v1 (UX §10, §11.1): today's classes in the academy's timezone (C-119), what needs
 * attention so far (no teacher, full days, upcoming holidays) and what happened recently. Finance
 * and growth pulses join in Phases 7 and 8. Everything is limited to the caller's scope.
 */
@Injectable()
export class TodayService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly sessions: SessionsService,
    private readonly batches: BatchesService,
  ) {}

  async today(): Promise<Today> {
    const { timeZone, today } = await this.sessions.zone();
    const batchScope = this.batches.scope('batch.read');
    const sessionScope = this.sessions.scope('timetable.read');
    const weekAhead = addDays(today, 7);
    const [sessions, holidays, batches, withoutTeacher, studentCount, recent] = await Promise.all([
      this.db.classSession.findMany({
        where: { AND: [sessionScope, { sessionDate: at(today) }] },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        take: 200,
        select: SESSION_SELECT,
      }),
      this.db.holiday.findMany({
        where: {
          removedAt: null,
          endDate: { gte: at(today) },
          startDate: { lte: at(addDays(today, 14)) },
        },
        orderBy: { startDate: 'asc' },
        take: 5,
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          kind: true,
          branchId: true,
          _count: { select: { sessions: true } },
        },
      }),
      this.db.batch.findMany({
        where: { AND: [batchScope, { status: 'ACTIVE' }] },
        select: { id: true, name: true, capacity: true, _count: { select: { teachers: true } } },
        take: 500,
      }),
      this.db.classSession.count({
        where: {
          AND: [
            sessionScope,
            { status: 'SCHEDULED', teacherId: null },
            { sessionDate: { gte: at(today), lte: at(weekAhead) } },
          ],
        },
      }),
      this.db.batchEnrolment
        .findMany({
          where: {
            batch: { AND: [batchScope, { status: 'ACTIVE' }] },
            startedOn: { lte: at(today) },
            OR: [{ endedOn: null }, { endedOn: { gte: at(today) } }],
          },
          distinct: ['studentId'],
          select: { studentId: true },
        })
        .then((rows) => rows.length),
      this.db.activityEvent.findMany({
        where: { entityType: 'BATCH' },
        orderBy: [{ at: 'desc' }, { id: 'desc' }],
        take: 30,
        select: { id: true, type: true, at: true, entityId: true, actorMembershipId: true },
      }),
    ]);
    const capped = batches.filter((b) => b.capacity !== null);
    const loads = await batchLoads(
      this.db,
      capped.map((b) => b.id),
      today,
    );
    const full = capped.flatMap((b) => {
      const load = loads.get(b.id)!;
      const over = overCapacity({ ...load }, b.capacity! - 1); // at or over capacity
      const busiest = load.dayLoad
        .filter((d) => over.includes(d.weekday))
        .sort((x, y) => y.students - x.students)[0];
      return busiest
        ? [
            {
              id: b.id,
              name: b.name,
              weekday: busiest.weekday,
              students: busiest.students,
              capacity: b.capacity!,
            },
          ]
        : [];
    });
    const names = new Map(batches.map((b) => [b.id, b.name]));
    const visible = recent.filter((r) => names.has(r.entityId)).slice(0, 8);
    const actors = await this.actorNames(visible.map((r) => r.actorMembershipId));
    const holidayToday = holidays.find((h) => day(h.startDate) <= today && day(h.endDate) >= today);
    return {
      date: today,
      weekday: isoWeekday(today),
      sessions: sessions.map((s) => toSession(s, timeZone)),
      holiday: holidayToday ? { name: holidayToday.name } : null,
      attention: {
        batchesWithoutTeacher: batches
          .filter((b) => b._count.teachers === 0)
          .map((b) => ({ id: b.id, name: b.name }))
          .slice(0, 10),
        batchesFull: full.slice(0, 10),
        sessionsWithoutTeacher: withoutTeacher,
        upcomingHolidays: holidays.map((h) => ({
          id: h.id,
          name: h.name,
          startDate: day(h.startDate),
          endDate: day(h.endDate),
          kind: h.kind,
          branchId: h.branchId,
          removedAt: null,
          cancelledSessions: h._count.sessions,
        })),
      },
      counts: { batches: batches.length, students: studentCount },
      recent: visible.map((r) => ({
        id: r.id,
        type: r.type,
        at: r.at.toISOString(),
        batchId: r.entityId,
        batchName: names.get(r.entityId)!,
        actorName: r.actorMembershipId ? (actors.get(r.actorMembershipId) ?? null) : null,
      })),
    };
  }

  private async actorNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((i): i is string => !!i))];
    if (!unique.length) return new Map();
    const rows = await this.db.membership.findMany({
      where: { id: { in: unique } } satisfies Prisma.MembershipWhereInput,
      select: { id: true, user: { select: { name: true } } },
    });
    return new Map(rows.map((r) => [r.id, r.user.name]));
  }
}
