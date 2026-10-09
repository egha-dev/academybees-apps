import {
  DEFAULT_ADMISSION_PREFIX,
  formatAdmissionNo,
  newId,
  SEQUENCE_KEYS,
} from '@academybee/contracts';
import { type TransactionClient } from '@academybee/database';
import { Injectable } from '@nestjs/common';

import { DomainError } from '../../core/errors/domain-error.js';

export type QuickStudent = {
  fullName: string;
  parentName?: string | undefined;
  parentPhone?: string | undefined;
};
export type CreatedStudent = { studentId: string; parentId: string | null; admissionNo: string };

/**
 * People commands (C-09, C-92): the minimal creates onboarding needs, on the request's academy
 * (tenant-bound transaction). The full Student 360 / Parents / Teachers workspaces build on these
 * in Phase 4. History is kept: nothing here deletes (ADR-025).
 */
@Injectable()
export class PeopleService {
  /** The signed-in member as a teacher (the owner teaches the first course themself). */
  async teacherForMember(
    tx: TransactionClient,
    input: {
      tenantId: string;
      branchId: string;
      membershipId: string;
      name: string;
      email: string | null;
    },
  ): Promise<string> {
    const existing = await tx.teacher.findFirst({
      where: { membershipId: input.membershipId },
      select: { id: true, status: true },
    });
    if (existing) {
      if (existing.status !== 'ACTIVE')
        await tx.teacher.update({ where: { id: existing.id }, data: { status: 'ACTIVE' } });
      return existing.id;
    }
    const id = newId();
    await tx.teacher.create({
      data: {
        id,
        tenantId: input.tenantId,
        branchId: input.branchId,
        membershipId: input.membershipId,
        fullName: input.name,
        email: input.email,
      },
    });
    return id;
  }

  /** A teacher who has been invited (C-67); linked to their membership when they accept. */
  async invitedTeacher(
    tx: TransactionClient,
    input: {
      tenantId: string;
      branchId: string;
      invitationId: string;
      name: string;
      email: string;
    },
  ): Promise<string> {
    const id = newId();
    await tx.teacher.create({
      data: {
        id,
        tenantId: input.tenantId,
        branchId: input.branchId,
        invitationId: input.invitationId,
        fullName: input.name,
        email: input.email,
      },
    });
    return id;
  }

  async archiveTeacher(tx: TransactionClient, teacherId: string): Promise<void> {
    await tx.teacher.updateMany({ where: { id: teacherId }, data: { status: 'ARCHIVED' } });
  }

  /**
   * Quick-add students (UX v1.1 §5): admission numbers from the academy's sequence, locked for
   * the transaction (C-91), and an optional parent contact per student. Parents aren't invited
   * here, so no consent is needed yet (G-06: consent comes with parent activation, Phase 4/7P).
   */
  async createStudents(
    tx: TransactionClient,
    input: {
      tenantId: string;
      branchId: string;
      admissionDate: string;
      createdById: string | null;
      students: QuickStudent[];
    },
  ): Promise<CreatedStudent[]> {
    const prefix = await this.admissionPrefix(tx);
    const first = await this.reserveSequence(
      tx,
      input.tenantId,
      SEQUENCE_KEYS.admission,
      input.students.length,
    );
    const created: CreatedStudent[] = [];
    for (const [i, s] of input.students.entries()) {
      const studentId = newId();
      const admissionNo = formatAdmissionNo(prefix, first + i);
      await tx.student.create({
        data: {
          id: studentId,
          tenantId: input.tenantId,
          branchId: input.branchId,
          admissionNo,
          fullName: s.fullName,
          admissionDate: new Date(`${input.admissionDate}T00:00:00Z`),
          createdById: input.createdById,
        },
      });
      const parentId =
        s.parentName || s.parentPhone
          ? await this.addParent(tx, input.tenantId, studentId, s, input.createdById)
          : null;
      created.push({ studentId, parentId, admissionNo });
    }
    return created;
  }

  /** Edit a quick-added student and their parent contact (going back in onboarding). */
  async updateQuickStudent(
    tx: TransactionClient,
    ref: {
      tenantId: string;
      studentId: string;
      parentId: string | null;
      createdById: string | null;
    },
    s: QuickStudent,
  ): Promise<string | null> {
    await tx.student.update({
      where: { id: ref.studentId },
      data: { fullName: s.fullName, version: { increment: 1 } },
    });
    const wantsParent = Boolean(s.parentName || s.parentPhone);
    if (ref.parentId && wantsParent) {
      await tx.parent.update({
        where: { id: ref.parentId },
        data: {
          fullName: s.parentName ?? s.fullName,
          phone: s.parentPhone ?? null,
          whatsappCapable: Boolean(s.parentPhone),
          version: { increment: 1 },
        },
      });
      return ref.parentId;
    }
    if (ref.parentId && !wantsParent) {
      await tx.parent.update({ where: { id: ref.parentId }, data: { status: 'ARCHIVED' } });
      return null;
    }
    return wantsParent ? this.addParent(tx, ref.tenantId, ref.studentId, s, ref.createdById) : null;
  }

  /** A student removed while still in onboarding: kept, but left (ADR-025). */
  async removeQuickStudent(
    tx: TransactionClient,
    studentId: string,
    parentId: string | null,
  ): Promise<void> {
    await tx.student.update({
      where: { id: studentId },
      data: { status: 'LEFT', archivedAt: new Date() },
    });
    if (parentId) await tx.parent.update({ where: { id: parentId }, data: { status: 'ARCHIVED' } });
  }

  private async addParent(
    tx: TransactionClient,
    tenantId: string,
    studentId: string,
    s: QuickStudent,
    createdById: string | null,
  ): Promise<string> {
    const parentId = newId();
    await tx.parent.create({
      data: {
        id: parentId,
        tenantId,
        // A phone without a name: the parent shows as the student's guardian until edited.
        fullName: s.parentName ?? s.fullName,
        phone: s.parentPhone ?? null,
        whatsappCapable: Boolean(s.parentPhone),
        createdById,
      },
    });
    await tx.parentStudent.create({
      data: {
        id: newId(),
        tenantId,
        parentId,
        studentId,
        relationship: 'GUARDIAN',
        isPrimaryContact: true,
      },
    });
    return parentId;
  }

  private async admissionPrefix(tx: TransactionClient): Promise<string> {
    const settings = await tx.tenantSettings.findFirst({ select: { finance: true } });
    const prefix = (settings?.finance as { admissionPrefix?: unknown } | null)?.admissionPrefix;
    return typeof prefix === 'string' && /^[\p{L}\p{N}/-]{0,10}$/u.test(prefix)
      ? prefix
      : DEFAULT_ADMISSION_PREFIX;
  }

  /**
   * Take `count` consecutive numbers from a per-academy sequence (C-91). The row is created on
   * first use and locked for the rest of the transaction, so concurrent creates never collide.
   */
  private async reserveSequence(
    tx: TransactionClient,
    tenantId: string,
    key: string,
    count: number,
  ): Promise<number> {
    if (count < 1) throw new DomainError('VALIDATION_FAILED', 'nothing to number');
    await tx.tenantSequence.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: { tenantId, key },
      update: {},
    });
    const [row] = await tx.$queryRaw<{ next_value: number }[]>`
      SELECT next_value FROM tenant_sequence WHERE tenant_id = ${tenantId}::uuid AND key = ${key} FOR UPDATE`;
    if (!row) throw new DomainError('INTERNAL', 'sequence missing');
    await tx.tenantSequence.update({
      where: { tenantId_key: { tenantId, key } },
      data: { nextValue: row.next_value + count },
    });
    return row.next_value;
  }
}
