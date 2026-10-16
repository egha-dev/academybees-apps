import { isoWeekday } from '@academybee/contracts';

import type {
  AcademyBeeDB,
  LocalAttendance,
  LocalBatch,
  LocalSession,
  LocalStudent,
} from './db.js';

/** A day plan includes the weekday (C-120): empty = every day the batch meets. */
export function attends(plan: readonly number[], weekday: number): boolean {
  return plan.length === 0 || plan.includes(weekday);
}

export type LocalClass = LocalSession & { batchName: string; courseName: string };

export type RollEntry = {
  student: LocalStudent;
  /** On the roll for this day; false = marked earlier but no longer enrolled that day. */
  expected: boolean;
  mark: LocalAttendance | null;
};

/**
 * Reads for the teacher screens, all from this device (C-124): they work the same offline.
 * Dates are academy-local `YYYY-MM-DD`, as the server sends them.
 */
export class LocalData {
  constructor(private readonly db: AcademyBeeDB) {}

  private async withBatch(sessions: LocalSession[]): Promise<LocalClass[]> {
    const batches = new Map<string, LocalBatch>(
      (await this.db.batches.toArray()).map((b) => [b.id, b]),
    );
    return sessions
      .filter((s) => batches.has(s.batchId))
      .map((s) => ({
        ...s,
        batchName: batches.get(s.batchId)!.name,
        courseName: batches.get(s.batchId)!.courseName,
      }))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  /** Classes between two academy-local dates (inclusive), in time order. */
  async classes(from: string, to: string): Promise<LocalClass[]> {
    return this.withBatch(
      await this.db.sessions.where('date').between(from, to, true, true).toArray(),
    );
  }

  async class(sessionId: string): Promise<LocalClass | null> {
    const s = await this.db.sessions.get(sessionId);
    return s ? ((await this.withBatch([s]))[0] ?? null) : null;
  }

  /** Who is expected at a class and their marks on this device (C-120). */
  async roll(sessionId: string): Promise<RollEntry[]> {
    const session = await this.db.sessions.get(sessionId);
    if (!session) return [];
    const weekday = isoWeekday(session.date);
    const [enrolments, marks] = await Promise.all([
      this.db.enrolments.where('batchId').equals(session.batchId).toArray(),
      this.db.attendance.where('sessionId').equals(sessionId).toArray(),
    ]);
    const expected = new Set(
      enrolments
        .filter(
          (e) =>
            e.startedOn <= session.date &&
            (!e.endedOn || e.endedOn >= session.date) &&
            attends(e.weekdays, weekday),
        )
        .map((e) => e.studentId),
    );
    const byStudent = new Map(marks.map((m) => [m.studentId, m]));
    const ids = [...new Set([...expected, ...byStudent.keys()])];
    const students = (await this.db.students.bulkGet(ids)).filter(
      (s): s is LocalStudent => s !== undefined,
    );
    return students
      .map((student) => ({
        student,
        expected: expected.has(student.id),
        mark: byStudent.get(student.id) ?? null,
      }))
      .sort((a, b) => a.student.fullName.localeCompare(b.student.fullName));
  }

  /** Students of the batches on this device, with the batches they are in. */
  async students(): Promise<(LocalStudent & { batchIds: string[] })[]> {
    const [students, enrolments] = await Promise.all([
      this.db.students.toArray(),
      this.db.enrolments.toArray(),
    ]);
    const batches = new Map<string, Set<string>>();
    for (const e of enrolments)
      if (!e.endedOn)
        batches.set(e.studentId, (batches.get(e.studentId) ?? new Set()).add(e.batchId));
    return students
      .map((s) => ({ ...s, batchIds: [...(batches.get(s.id) ?? [])] }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  /** A student's recent marks on this device, newest first. */
  async marksOf(studentId: string): Promise<(LocalAttendance & { date: string | null })[]> {
    const marks = await this.db.attendance.where('studentId').equals(studentId).toArray();
    const sessions = new Map(
      (await this.db.sessions.bulkGet(marks.map((m) => m.sessionId)))
        .filter((s): s is LocalSession => s !== undefined)
        .map((s) => [s.id, s.date]),
    );
    return marks
      .map((m) => ({ ...m, date: sessions.get(m.sessionId) ?? null }))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  }

  /** True once a bootstrap has stored a working set on this device. */
  async ready(): Promise<boolean> {
    return (await this.db.meta.get('watermark')) !== undefined;
  }
}
