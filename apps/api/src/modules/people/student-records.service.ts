import {
  type ConsentPurpose,
  currentNoticeVersion,
  newId,
  type RecordConsentSchema,
} from '@academybee/contracts';
import type { TenantBoundClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { z } from 'zod';

import { AnalyticsService } from '../../core/analytics/analytics.service.js';
import { AuditService } from '../../core/audit/audit.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { MediaStorage } from '../../core/media/media-storage.js';
import { scopedWhere } from '../../core/rbac/scope.js';
import { ActivityService } from './activity.service.js';
import { studentPolicy } from './people.policy.js';
import { StudentPhotoService } from './student-photo.service.js';

/**
 * The restricted parts of a student's record:
 * - **Health notes** (G-05, C-90, C-104): only `student.health.read` holders in scope (owner,
 *   admin, assigned teachers) and **every read is audited**, including reads that find no note.
 *   Edits need `student.health.manage`. The text never reaches the timeline or analytics.
 * - **Consent** (G-06, ADR-034, C-103): append-only history per parent and child. Staff may record
 *   a paper / in-person consent or a withdrawal; it never activates a parent account (only the
 *   parent's own consent on the Family Hub does, C-102).
 */
@Injectable()
export class StudentRecordsService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
    private readonly photos: StudentPhotoService,
    private readonly storage: MediaStorage,
  ) {}

  async readHealthNote(studentId: string) {
    const student = await this.db.student.findFirst({
      where: {
        AND: [{ id: studentId }, scopedWhere(this.cls, 'student.health.read', studentPolicy)],
      },
      select: {
        id: true,
        healthNote: { select: { notes: true, version: true, updatedAt: true } },
      },
    });
    if (!student) throw new DomainError('NOT_FOUND', 'student');
    await this.audit.record({
      action: 'student.health_note_read',
      entityType: 'Student',
      entityId: studentId,
      metadata: { found: Boolean(student.healthNote) },
    });
    const note = student.healthNote;
    return {
      note: note
        ? { notes: note.notes, version: note.version, updatedAt: note.updatedAt.toISOString() }
        : null,
    };
  }

  async writeHealthNote(studentId: string, input: { notes: string; version?: number | undefined }) {
    await this.db.$transaction(async (tx) => {
      const student = await tx.student.findFirst({
        where: {
          AND: [
            { id: studentId, archivedAt: null },
            scopedWhere(this.cls, 'student.health.manage', studentPolicy),
          ],
        },
        select: { tenantId: true, healthNote: { select: { version: true } } },
      });
      if (!student) throw new DomainError('NOT_FOUND', 'student');
      const current = student.healthNote;
      if (current && current.version !== input.version) throw new DomainError('VERSION_CONFLICT');
      const membershipId = this.cls.get('membership')?.id ?? null;
      if (!input.notes) {
        if (current) await tx.studentHealthNote.deleteMany({ where: { studentId } });
      } else if (current) {
        const updated = await tx.studentHealthNote.updateMany({
          where: { studentId, version: current.version },
          data: { notes: input.notes, updatedById: membershipId, version: { increment: 1 } },
        });
        if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
      } else {
        await tx.studentHealthNote.create({
          data: {
            tenantId: student.tenantId,
            studentId,
            notes: input.notes,
            updatedById: membershipId,
          },
        });
      }
      await this.audit.record(
        {
          action: 'student.health_note_updated',
          entityType: 'Student',
          entityId: studentId,
          metadata: { cleared: !input.notes },
        },
        tx,
      );
      await this.activity.record(tx, {
        tenantId: student.tenantId,
        entityType: 'STUDENT',
        entityId: studentId,
        type: 'health_note.updated',
      });
    });
    return this.readHealthNote(studentId);
  }

  async consents(studentId: string) {
    await this.assertStudent(studentId, 'student.read');
    const rows = await this.db.consentRecord.findMany({
      where: { studentId },
      orderBy: { recordedAt: 'desc' },
      select: {
        id: true,
        parentId: true,
        action: true,
        purposes: true,
        noticeVersion: true,
        channel: true,
        recordedAt: true,
        parent: { select: { fullName: true } },
      },
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        parentId: r.parentId,
        parentName: r.parent.fullName,
        action: r.action,
        purposes: r.purposes as ConsentPurpose[],
        noticeVersion: r.noticeVersion,
        channel: r.channel,
        recordedAt: r.recordedAt.toISOString(),
      })),
    };
  }

  async recordConsent(studentId: string, input: z.infer<typeof RecordConsentSchema>) {
    const removedPhoto = await this.db.$transaction(async (tx) => {
      const student = await tx.student.findFirst({
        where: {
          AND: [{ id: studentId }, scopedWhere(this.cls, 'student.update', studentPolicy)],
        },
        select: { tenantId: true },
      });
      if (!student) throw new DomainError('NOT_FOUND', 'student');
      const link = await tx.parentStudent.findFirst({
        where: { studentId, parentId: input.parentId },
        select: { id: true },
      });
      if (!link)
        throw new DomainError('VALIDATION_FAILED', 'not this child’s parent', [
          { path: 'parentId', issue: 'not_linked' },
        ]);
      let purposes = input.purposes;
      if (input.action === 'WITHDRAW' && purposes.length === 0) {
        // Withdrawing without naming purposes withdraws everything last granted.
        const last = await tx.consentRecord.findFirst({
          where: { studentId, parentId: input.parentId, action: 'GRANT' },
          orderBy: { recordedAt: 'desc' },
          select: { purposes: true },
        });
        purposes = (last?.purposes as ConsentPurpose[] | undefined) ?? ['service'];
      }
      await tx.consentRecord.create({
        data: {
          id: newId(),
          tenantId: student.tenantId,
          parentId: input.parentId,
          studentId,
          action: input.action,
          purposes,
          noticeVersion: currentNoticeVersion(),
          channel: input.channel,
          recordedById: this.cls.get('membership')?.id ?? null,
        },
      });
      await this.audit.record(
        {
          action: 'consent.recorded',
          entityType: 'Student',
          entityId: studentId,
          metadata: { parentId: input.parentId, action: input.action, channel: input.channel },
        },
        tx,
      );
      await this.activity.record(tx, {
        tenantId: student.tenantId,
        entityType: 'STUDENT',
        entityId: studentId,
        type: 'consent.recorded',
        data: { action: input.action, channel: input.channel },
      });
      await this.analytics.track(tx, 'consent.recorded', {
        channel: input.channel,
        action: input.action,
      });
      // Without photo consent any more, the student's photo is removed (G-06, C-97).
      return input.action === 'WITHDRAW' ? this.photos.removeIfConsentGone(tx, studentId) : null;
    });
    if (removedPhoto) await this.storage.deletePrivate(removedPhoto);
    return this.consents(studentId);
  }

  private async assertStudent(studentId: string, capability: 'student.read' | 'student.update') {
    const row = await this.db.student.findFirst({
      where: { AND: [{ id: studentId }, scopedWhere(this.cls, capability, studentPolicy)] },
      select: { id: true },
    });
    if (!row) throw new DomainError('NOT_FOUND', 'student');
  }
}
