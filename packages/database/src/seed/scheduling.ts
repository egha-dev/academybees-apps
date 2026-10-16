import { addDays, isoWeekday, zonedInstant } from '@academybee/contracts';

import type { PrismaClient } from '../generated/prisma/client.js';
import { DEV_TENANTS } from './tenants.js';

/**
 * Local/CI demo timetable for demo-a (C-37, Phase 5): the scheduling patterns academies actually
 * use (PO review, C-120/C-121) — weekend, Tue/Thu at different times, Mon–Fri (full), Mon–Sat
 * early mornings with day plans, a one-to-one lesson without a teacher — plus an upcoming
 * holiday. The API generates their classes on start and nightly (C-112). Idempotent upserts.
 */
/** Ranges: batches 1–9, courses 101–199, rules 200–299, enrolments 1000–5999, holiday 9001. */
const id = (n: number) => `01a10000-0000-7000-8000-0000005c${String(n).padStart(4, '0')}`;
const OWNER_TEACHER = '01a10000-0000-7000-8000-00000000e001';
const TEACHER = '01a10000-0000-7000-8000-00000000e002';

type Slot = [weekday: number, start: string, end: string];
const BATCHES: Array<{
  n: number;
  course: number;
  name: string;
  capacity: number | null;
  teacher: string | null;
  slots: Slot[];
  /** Seeded student indexes (EXTRA_STUDENTS order) and their day plans ([] = every day). */
  students: Array<[index: number, weekdays: number[]]>;
}> = [
  {
    n: 1,
    course: 101,
    name: 'Weekend Science',
    capacity: 15,
    teacher: OWNER_TEACHER,
    slots: [
      [6, '10:00', '11:30'],
      [7, '10:00', '12:00'],
    ],
    students: [
      [0, []],
      [1, []],
      [2, [6]],
    ],
  },
  {
    n: 2,
    course: 102,
    name: 'Spoken English Tue/Thu',
    capacity: 12,
    teacher: TEACHER,
    slots: [
      [2, '17:00', '18:00'],
      [4, '18:00', '19:00'],
    ],
    students: [
      [3, []],
      [4, []],
      [5, []],
      [6, [4]],
    ],
  },
  {
    n: 3,
    course: 103,
    name: 'Board Prep Mon–Fri',
    capacity: 3,
    teacher: OWNER_TEACHER,
    slots: [1, 2, 3, 4, 5].map((d) => [d, '16:00', '17:00'] as Slot),
    students: [
      [7, []],
      [8, []],
      [9, []],
    ],
  },
  {
    n: 4,
    course: 102,
    name: 'Early Morning Mon–Sat',
    capacity: 10,
    teacher: OWNER_TEACHER,
    slots: [1, 2, 3, 4, 5, 6].map((d) => [d, '06:30', '07:30'] as Slot),
    students: [
      [10, []],
      [11, [1, 3]],
      [12, [2, 4, 6]],
    ],
  },
  {
    n: 5,
    course: 101,
    name: 'One-to-one: Physics',
    capacity: 1,
    teacher: null,
    slots: [[3, '16:00', '16:45']],
    students: [[13, []]],
  },
];
const COURSES = [
  [101, 'Science'],
  [102, 'Spoken English'],
  [103, 'Board Exam Preparation'],
] as const;

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export async function seedDevScheduling(
  db: PrismaClient,
  studentId: (i: number) => string,
): Promise<number> {
  const a = DEV_TENANTS.find((t) => t.slug === 'demo-a');
  if (!a) throw new Error('demo-a missing');
  const today = new Date(new Date().toISOString().slice(0, 10));
  const holiday = new Date(today.getTime() + 12 * 86_400_000);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.tenant_id', ${a.id}, true)`;
    for (const [n, name] of COURSES)
      await tx.course.upsert({
        where: { id: id(n) },
        create: { id: id(n), tenantId: a.id, name },
        update: {},
      });
    for (const b of BATCHES) {
      await tx.batch.upsert({
        where: { id: id(b.n) },
        create: {
          id: id(b.n),
          tenantId: a.id,
          branchId: a.branchId,
          courseId: id(b.course),
          name: b.name,
          capacity: b.capacity,
        },
        update: {},
      });
      if (b.teacher)
        await tx.batchTeacher.createMany({
          data: [{ tenantId: a.id, batchId: id(b.n), teacherId: b.teacher, isPrimary: true }],
          skipDuplicates: true,
        });
      for (const [i, [weekday, start, end]] of b.slots.entries())
        await tx.scheduleRule.upsert({
          where: { id: id(200 + b.n * 10 + i) },
          create: {
            id: id(200 + b.n * 10 + i),
            tenantId: a.id,
            batchId: id(b.n),
            teacherId: b.teacher,
            weekday,
            startMinute: minutes(start),
            endMinute: minutes(end),
            effectiveFrom: today,
          },
          update: {},
        });
      for (const [index, weekdays] of b.students) {
        const open = await tx.batchEnrolment.findFirst({
          where: { batchId: id(b.n), studentId: studentId(index) },
          select: { id: true },
        });
        if (!open)
          await tx.batchEnrolment.create({
            data: {
              id: id(1000 + b.n * 100 + index),
              tenantId: a.id,
              batchId: id(b.n),
              studentId: studentId(index),
              // Joined a month ago, so the seeded past classes (attendance) have them on the roll.
              startedOn: new Date(today.getTime() - 30 * 86_400_000),
              weekdays,
            },
          });
      }
    }
    await tx.holiday.upsert({
      where: { id: id(9001) },
      create: {
        id: id(9001),
        tenantId: a.id,
        name: 'Founders’ Day',
        startDate: holiday,
        endDate: holiday,
      },
      update: {},
    });
  });
  return BATCHES.length;
}

const pastId = (n: number) => `01a10000-0000-7000-8000-0000005d${String(n).padStart(4, '0')}`;
/** One id per (batch, days back, slot, student): its own range, so no two marks collide. */
const markId = (n: number) => `01a10000-0000-7000-8000-00005e${String(n).padStart(6, '0')}`;

/**
 * Two weeks of past classes with roll calls in demo-a (Phase 6), so attendance percentages,
 * Student 360 and the Batch Workspace have something to show. The classes are one-off
 * (MANUAL) completed classes, marked by the batch's teacher: mostly present, a few absent, late
 * or on leave, the same on every run. Idempotent (fixed ids, upserts).
 */
export async function seedDevAttendance(
  db: PrismaClient,
  studentId: (i: number) => string,
): Promise<number> {
  const a = DEV_TENANTS.find((t) => t.slug === 'demo-a');
  if (!a) throw new Error('demo-a missing');
  const timeZone = 'Asia/Kolkata';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
  let marks = 0;
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.tenant_id', ${a.id}, true)`;
    const owner = await tx.membership.findFirst({
      where: { tenantId: a.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!owner) return;
    for (const b of BATCHES) {
      const teacher = b.teacher
        ? await tx.teacher.findUnique({ where: { id: b.teacher }, select: { membershipId: true } })
        : null;
      const markedById = teacher?.membershipId ?? owner.id;
      for (let back = 14; back >= 1; back--) {
        const date = addDays(today, -back);
        const weekday = isoWeekday(date);
        for (const [slot, [day, start, end]] of b.slots.entries()) {
          if (day !== weekday) continue;
          const sessionId = pastId(b.n * 1000 + back * 10 + slot);
          const sessionDate = new Date(`${date}T00:00:00Z`);
          await tx.classSession.upsert({
            where: { id: sessionId },
            create: {
              id: sessionId,
              tenantId: a.id,
              branchId: a.branchId,
              batchId: id(b.n),
              teacherId: b.teacher,
              sessionDate,
              startsAt: zonedInstant(date, minutes(start), timeZone),
              endsAt: zonedInstant(date, minutes(end), timeZone),
              origin: 'MANUAL',
              status: 'COMPLETED',
            },
            update: {},
          });
          for (const [index, plan] of b.students) {
            if (plan.length && !plan.includes(weekday)) continue;
            // Deterministic spread: ~1 in 9 absent, 1 in 15 late, 1 in 25 on leave.
            const k = (index * 7 + back * 13 + slot * 5) % 225;
            const status =
              k % 9 === 0 ? 'ABSENT' : k % 15 === 1 ? 'LATE' : k % 25 === 2 ? 'LEAVE' : 'PRESENT';
            const at = zonedInstant(date, minutes(end), timeZone);
            await tx.attendance.upsert({
              where: {
                tenantId_sessionId_studentId: {
                  tenantId: a.id,
                  sessionId,
                  studentId: studentId(index),
                },
              },
              create: {
                id: markId(b.n * 100_000 + back * 1000 + slot * 100 + index),
                tenantId: a.id,
                branchId: a.branchId,
                batchId: id(b.n),
                sessionId,
                studentId: studentId(index),
                sessionDate,
                status,
                markedById,
                markedAt: at,
              },
              update: {},
            });
            marks += 1;
          }
        }
      }
    }
  });
  return marks;
}
