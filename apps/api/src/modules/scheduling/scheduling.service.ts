import { minutesToTime, newId, timeToMinutes } from '@academybee/contracts';
import type { TransactionClient } from '@academybee/database';
import { Injectable } from '@nestjs/common';

import { generateSessions } from './session-generator.js';

export type Slot = { weekday: number; start: string; end: string };

/**
 * Scheduling commands (C-09, C-92, ADR-024): course, batch and its teacher and students, weekly
 * slots and their class sessions. Dates are academy-local; session instants are UTC computed in
 * the academy's timezone. The Phase 5 timetable workspace builds on the same tables.
 */
@Injectable()
export class SchedulingService {
  async createCourse(
    tx: TransactionClient,
    tenantId: string,
    input: { name: string; description?: string | undefined },
  ): Promise<string> {
    const id = newId();
    await tx.course.create({
      data: { id, tenantId, name: input.name, description: input.description ?? null },
    });
    return id;
  }

  async updateCourse(
    tx: TransactionClient,
    id: string,
    input: { name: string; description?: string | undefined },
  ): Promise<void> {
    await tx.course.update({
      where: { id },
      data: { name: input.name, description: input.description ?? null, version: { increment: 1 } },
    });
  }

  async createBatch(
    tx: TransactionClient,
    input: {
      tenantId: string;
      branchId: string;
      courseId: string;
      name: string;
      capacity: number | null;
      startsOn: string;
    },
  ): Promise<string> {
    const id = newId();
    await tx.batch.create({
      data: {
        id,
        tenantId: input.tenantId,
        branchId: input.branchId,
        courseId: input.courseId,
        name: input.name,
        capacity: input.capacity,
        startsOn: new Date(`${input.startsOn}T00:00:00Z`),
      },
    });
    return id;
  }

  async updateBatch(
    tx: TransactionClient,
    id: string,
    input: { name: string; capacity: number | null; courseId?: string },
  ): Promise<void> {
    await tx.batch.update({
      where: { id },
      data: {
        name: input.name,
        capacity: input.capacity,
        ...(input.courseId ? { courseId: input.courseId } : {}),
        version: { increment: 1 },
      },
    });
  }

  /** The batch's one primary teacher; future generated sessions and rules follow the change. */
  async setPrimaryTeacher(
    tx: TransactionClient,
    tenantId: string,
    batchId: string,
    teacherId: string,
  ): Promise<void> {
    await tx.batchTeacher.deleteMany({ where: { batchId, teacherId: { not: teacherId } } });
    await tx.batchTeacher.upsert({
      where: { batchId_teacherId: { batchId, teacherId } },
      create: { tenantId, batchId, teacherId, isPrimary: true },
      update: { isPrimary: true },
    });
    await tx.scheduleRule.updateMany({ where: { batchId }, data: { teacherId } });
    await tx.classSession.updateMany({
      where: { batchId, status: 'SCHEDULED', startsAt: { gt: new Date() } },
      data: { teacherId },
    });
  }

  /** Enrol students that aren't enrolled yet (one open enrolment each, ARCHITECTURE §8.4). */
  async enrol(
    tx: TransactionClient,
    tenantId: string,
    batchId: string,
    studentIds: string[],
    startedOn: string,
  ): Promise<void> {
    if (!studentIds.length) return;
    const open = new Set(
      (
        await tx.batchEnrolment.findMany({
          where: { batchId, studentId: { in: studentIds }, endedOn: null },
          select: { studentId: true },
        })
      ).map((e) => e.studentId),
    );
    const add = studentIds.filter((id) => !open.has(id));
    if (add.length)
      await tx.batchEnrolment.createMany({
        data: add.map((studentId) => ({
          id: newId(),
          tenantId,
          batchId,
          studentId,
          startedOn: new Date(`${startedOn}T00:00:00Z`),
        })),
      });
  }

  /** Close enrolments of students no longer in the batch (kept as history, ADR-025). */
  async unenrol(
    tx: TransactionClient,
    batchId: string,
    studentIds: string[],
    endedOn: string,
  ): Promise<void> {
    if (!studentIds.length) return;
    await tx.batchEnrolment.updateMany({
      where: { batchId, studentId: { in: studentIds }, endedOn: null },
      data: { endedOn: new Date(`${endedOn}T00:00:00Z`) },
    });
  }

  /**
   * Replace the batch's weekly slots (onboarding, C-92) and create its classes for the rolling
   * window (C-112). Earlier onboarding rules and their untouched future sessions are removed first:
   * nothing has been marked on them yet. Returns the new rule ids and the classes created.
   */
  async replaceWeeklySlots(
    tx: TransactionClient,
    input: {
      tenantId: string;
      branchId: string;
      batchId: string;
      teacherId: string | null;
      slots: Slot[];
      timeZone: string;
      today: string;
      previousRuleIds: string[];
    },
  ): Promise<{ ruleIds: string[]; sessionCount: number }> {
    if (input.previousRuleIds.length) {
      await tx.classSession.deleteMany({
        where: {
          scheduleRuleId: { in: input.previousRuleIds },
          status: 'SCHEDULED',
          origin: 'GENERATED',
          modifiedAt: null,
        },
      });
      await tx.scheduleRule.deleteMany({ where: { id: { in: input.previousRuleIds } } });
    }
    const rules = input.slots.map((slot) => ({ id: newId(), slot }));
    if (rules.length)
      await tx.scheduleRule.createMany({
        data: rules.map(({ id, slot }) => ({
          id,
          tenantId: input.tenantId,
          batchId: input.batchId,
          teacherId: input.teacherId,
          weekday: slot.weekday,
          startMinute: timeToMinutes(slot.start),
          endMinute: timeToMinutes(slot.end),
          effectiveFrom: new Date(`${input.today}T00:00:00Z`),
        })),
      });
    const sessionCount = await generateSessions(tx, {
      tenantId: input.tenantId,
      batchIds: [input.batchId],
    });
    return { ruleIds: rules.map((r) => r.id), sessionCount };
  }

  /**
   * The academy's timezone changed: its upcoming generated classes move with it (review M1).
   * Untouched future sessions are recreated from the rules in the new timezone (the tenant row is
   * already updated in this transaction); past, manual, cancelled or changed ones stay (C-113).
   */
  async regenerateForTimezone(
    tx: TransactionClient,
    input: { tenantId: string; timeZone: string; today: string },
  ): Promise<number> {
    await tx.classSession.deleteMany({
      where: {
        status: 'SCHEDULED',
        origin: 'GENERATED',
        modifiedAt: null,
        sessionDate: { gte: new Date(`${input.today}T00:00:00Z`) },
      },
    });
    return generateSessions(tx, { tenantId: input.tenantId });
  }

  /** The batch's weekly slots and its next classes, for the onboarding preview. */
  async timetable(
    tx: Pick<TransactionClient, 'scheduleRule' | 'classSession'>,
    batchId: string,
    timeZone: string,
  ) {
    const [rules, upcoming, count] = await Promise.all([
      tx.scheduleRule.findMany({
        where: { batchId, effectiveTo: null },
        orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
        select: { weekday: true, startMinute: true, endMinute: true },
      }),
      tx.classSession.findMany({
        where: { batchId, status: 'SCHEDULED', startsAt: { gt: new Date() } },
        orderBy: { startsAt: 'asc' },
        take: 5,
        select: { sessionDate: true, startsAt: true, endsAt: true },
      }),
      tx.classSession.count({
        where: { batchId, status: 'SCHEDULED', startsAt: { gt: new Date() } },
      }),
    ]);
    const local = (d: Date) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(d);
    return {
      slots: rules.map((r) => ({
        weekday: r.weekday,
        start: minutesToTime(r.startMinute),
        end: minutesToTime(r.endMinute),
      })),
      upcoming: upcoming.map((s) => ({
        date: s.sessionDate.toISOString().slice(0, 10),
        start: local(s.startsAt),
        end: local(s.endsAt),
      })),
      sessionCount: count,
    };
  }
}
