import {
  type CreateStudent,
  type CursorPage,
  type CustomFieldValues,
  decodeCursor,
  encodeCursor,
  type EmergencyContact,
  localDate,
  newId,
  type ParentRelationship,
  RESTORE_WINDOW_DAYS,
  type Student,
  type StudentAddress,
  type StudentListItem,
  type StudentListQuery,
  type UpdateStudent,
} from '@academybee/contracts';
import { Prisma, type TenantBoundClient, type TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';

import { AnalyticsService } from '../../core/analytics/analytics.service.js';
import { AuditService } from '../../core/audit/audit.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { EntitlementService } from '../../core/entitlements/entitlement.service.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { scopedWhere } from '../../core/rbac/scope.js';
import { ActivityService } from './activity.service.js';
import { CustomFieldsService } from './custom-fields.service.js';
import { ParentsService } from './parents.service.js';
import { PeopleService } from './people.service.js';
import { studentPolicy } from './people.policy.js';

const CursorKeys = z.object({ n: z.string(), id: z.uuid() });
const DAY_MS = 86_400_000;
/** Statuses that take a seat against the plan's student limit (core/entitlements usage). */
const SEATED = new Set(['ACTIVE', 'ON_HOLD']);

type StudentCapability = 'student.read' | 'student.update' | 'student.archive';

const DETAIL_SELECT = {
  id: true,
  tenantId: true,
  admissionNo: true,
  fullName: true,
  preferredName: true,
  dateOfBirth: true,
  gender: true,
  schoolName: true,
  grade: true,
  admissionDate: true,
  address: true,
  emergencyContact: true,
  tags: true,
  customFields: true,
  status: true,
  archivedAt: true,
  version: true,
  createdAt: true,
} as const satisfies Prisma.StudentSelect;

/**
 * Students (UX §11.3–11.4, G-05, G-26, G-27): list, Student 360 data, create, edit, status,
 * archive and restore — always within the caller's scope (people.policy.ts; out of scope = 404).
 * Health notes are never part of a student response (C-90).
 */
@Injectable()
export class StudentsService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly people: PeopleService,
    private readonly parents: ParentsService,
    private readonly fields: CustomFieldsService,
    private readonly activity: ActivityService,
    private readonly analytics: AnalyticsService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementService,
  ) {}

  async list(query: StudentListQuery): Promise<CursorPage<StudentListItem>> {
    const after = query.cursor ? decodeCursor(query.cursor, CursorKeys) : undefined;
    if (after === null) throw new DomainError('VALIDATION_FAILED', 'bad cursor');
    const and: Prisma.StudentWhereInput[] = [
      this.scope('student.read'),
      query.archived ? { archivedAt: { not: null } } : { archivedAt: null },
    ];
    if (query.status) and.push({ status: query.status });
    if (query.batchId)
      and.push({ enrolments: { some: { batchId: query.batchId, endedOn: null } } });
    if (query.courseId)
      and.push({ enrolments: { some: { endedOn: null, batch: { courseId: query.courseId } } } });
    if (query.q) and.push(searchWhere(query.q));
    if (after)
      and.push({
        OR: [{ fullName: { gt: after.n } }, { fullName: after.n, id: { gt: after.id } }],
      });
    const rows = await this.db.student.findMany({
      where: { AND: and },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
      select: {
        id: true,
        admissionNo: true,
        fullName: true,
        preferredName: true,
        status: true,
        archivedAt: true,
        parents: {
          orderBy: [{ isPrimaryContact: 'desc' }, { createdAt: 'asc' }],
          take: 1,
          select: { parent: { select: { fullName: true, phone: true } } },
        },
      },
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const showParents = this.canRead('parent.read');
    return {
      items: page.map((r) => ({
        id: r.id,
        admissionNo: r.admissionNo,
        fullName: r.fullName,
        preferredName: r.preferredName,
        status: r.status,
        archivedAt: r.archivedAt?.toISOString() ?? null,
        primaryParent: showParents ? (r.parents[0]?.parent ?? null) : null,
      })),
      nextCursor:
        rows.length > query.limit && last ? encodeCursor({ n: last.fullName, id: last.id }) : null,
    };
  }

  async get(id: string): Promise<Student> {
    const row = await this.db.student.findFirst({
      where: { AND: [{ id }, this.scope('student.read')] },
      select: {
        ...DETAIL_SELECT,
        parents: {
          orderBy: [{ isPrimaryContact: 'desc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            relationship: true,
            isPrimaryContact: true,
            pickupAuthorised: true,
            parent: { select: { id: true, fullName: true, phone: true, email: true } },
          },
        },
        enrolments: {
          where: { endedOn: null },
          orderBy: { startedOn: 'asc' },
          select: {
            startedOn: true,
            batch: { select: { id: true, name: true, course: { select: { name: true } } } },
          },
        },
        // Only someone who may read health notes learns that one exists (G-05).
        healthNote: this.canRead('student.health.read') ? { select: { studentId: true } } : false,
      },
    });
    if (!row) throw new DomainError('NOT_FOUND', 'student');
    return {
      id: row.id,
      admissionNo: row.admissionNo,
      fullName: row.fullName,
      preferredName: row.preferredName,
      dateOfBirth: dateOnly(row.dateOfBirth),
      gender: row.gender,
      schoolName: row.schoolName,
      grade: row.grade,
      admissionDate: dateOnly(row.admissionDate)!,
      address: (row.address as StudentAddress | null) ?? null,
      emergencyContact: (row.emergencyContact as EmergencyContact | null) ?? null,
      tags: row.tags,
      customFields: (row.customFields ?? {}) as CustomFieldValues,
      status: row.status,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      restorableUntil: row.archivedAt
        ? dateOnly(new Date(row.archivedAt.getTime() + RESTORE_WINDOW_DAYS * DAY_MS))
        : null,
      hasHealthNote: Boolean(row.healthNote),
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      parents: (this.canRead('parent.read') ? row.parents : []).map((l) => ({
        linkId: l.id,
        parentId: l.parent.id,
        fullName: l.parent.fullName,
        phone: l.parent.phone,
        email: l.parent.email,
        relationship: l.relationship as ParentRelationship,
        isPrimaryContact: l.isPrimaryContact,
        pickupAuthorised: l.pickupAuthorised,
      })),
      enrolments: row.enrolments.map((e) => ({
        batchId: e.batch.id,
        batchName: e.batch.name,
        courseName: e.batch.course.name,
        startedOn: dateOnly(e.startedOn)!,
      })),
    };
  }

  /** Add Student (UX §11.3). The plan's student limit is checked by `@Limit('students')`. */
  async create(input: CreateStudent): Promise<Student> {
    const ctx = await this.context();
    if (input.parent && !this.canRead('parent.manage'))
      throw new DomainError('FORBIDDEN', 'missing parent.manage');
    const id = await this.db.$transaction(async (tx) => {
      const customFields = await this.fields.validate(tx, input.customFields, { requireAll: true });
      const [admissionNo] = await this.people.allocateAdmissionNos(tx, ctx.tenantId, 1);
      const studentId = newId();
      await tx.student.create({
        data: {
          id: studentId,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          admissionNo: admissionNo!,
          fullName: input.fullName,
          preferredName: input.preferredName ?? null,
          dateOfBirth: toDate(input.dateOfBirth),
          gender: input.gender ?? null,
          schoolName: input.schoolName ?? null,
          grade: input.grade ?? null,
          admissionDate: toDate(input.admissionDate ?? ctx.today)!,
          address: jsonOrNull(input.address),
          emergencyContact: jsonOrNull(input.emergencyContact),
          tags: input.tags ?? [],
          customFields,
          createdById: ctx.membershipId,
        },
      });
      await this.activity.record(tx, {
        tenantId: ctx.tenantId,
        entityType: 'STUDENT',
        entityId: studentId,
        type: 'student.created',
        data: { source: 'manual' },
      });
      if (input.parent)
        await this.parents.link(tx, {
          tenantId: ctx.tenantId,
          studentId,
          link: input.parent,
        });
      await this.analytics.track(tx, 'student.created', { source: 'manual', count: 1 });
      return studentId;
    });
    return this.get(id);
  }

  async update(id: string, input: UpdateStudent): Promise<Student> {
    await this.db.$transaction(async (tx) => {
      const row = await this.loadForWrite(tx, id, 'student.update');
      const { version, customFields, ...rest } = input;
      const fields = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      const data: Prisma.StudentUpdateManyMutationInput = {
        ...('fullName' in fields ? { fullName: input.fullName! } : {}),
        ...('preferredName' in fields ? { preferredName: input.preferredName ?? null } : {}),
        ...('dateOfBirth' in fields ? { dateOfBirth: toDate(input.dateOfBirth) } : {}),
        ...('gender' in fields ? { gender: input.gender ?? null } : {}),
        ...('schoolName' in fields ? { schoolName: input.schoolName ?? null } : {}),
        ...('grade' in fields ? { grade: input.grade ?? null } : {}),
        ...('admissionDate' in fields ? { admissionDate: toDate(input.admissionDate)! } : {}),
        ...('address' in fields ? { address: jsonOrNull(input.address) } : {}),
        ...('emergencyContact' in fields
          ? { emergencyContact: jsonOrNull(input.emergencyContact) }
          : {}),
        ...('tags' in fields ? { tags: input.tags ?? [] } : {}),
      };
      if (customFields)
        data.customFields = await this.fields.validate(tx, customFields, {
          previous: (row.customFields ?? {}) as CustomFieldValues,
          requireAll: false,
        });
      const changed = [...Object.keys(fields), ...(customFields ? ['customFields'] : [])];
      if (!changed.length) return;
      await this.bumpVersion(tx, id, version, data);
      await this.activity.record(tx, {
        tenantId: row.tenantId,
        entityType: 'STUDENT',
        entityId: id,
        type: 'student.updated',
        data: { fields: changed.join(',') },
      });
    });
    return this.get(id);
  }

  /** G-27: ON_HOLD / COMPLETED / LEFT / ACTIVE with a reason (audited). Undo sends the old one. */
  async changeStatus(
    id: string,
    input: { version: number; status: Student['status']; reason: string },
  ): Promise<Student> {
    await this.db.$transaction(async (tx) => {
      const row = await this.loadForWrite(tx, id, 'student.update');
      if (row.status === input.status)
        throw new DomainError('INVALID_STATE_TRANSITION', `already ${input.status}`);
      // Moving back into a seat counts against the plan's limit (ADR-028).
      if (!SEATED.has(row.status) && SEATED.has(input.status))
        await this.entitlements.assertWithinLimit('students', 1, tx);
      await this.bumpVersion(tx, id, input.version, { status: input.status });
      await this.audit.record(
        {
          action: 'student.status_changed',
          entityType: 'Student',
          entityId: id,
          before: { status: row.status },
          after: { status: input.status },
          metadata: { reason: input.reason },
        },
        tx,
      );
      await this.activity.record(tx, {
        tenantId: row.tenantId,
        entityType: 'STUDENT',
        entityId: id,
        type: 'student.status_changed',
        data: { from: row.status, to: input.status },
      });
      await this.analytics.track(tx, 'student.status_changed', { to: input.status });
    });
    return this.get(id);
  }

  /** Archive (G-26, C-108): hidden from lists and search, restorable for 90 days. */
  async archive(id: string, input: { version: number; reason?: string | undefined }) {
    await this.db.$transaction(async (tx) => {
      const row = await this.loadForWrite(tx, id, 'student.archive');
      await this.bumpVersion(tx, id, input.version, { archivedAt: new Date() });
      await this.audit.record(
        {
          action: 'student.archived',
          entityType: 'Student',
          entityId: id,
          ...(input.reason ? { metadata: { reason: input.reason } } : {}),
        },
        tx,
      );
      await this.activity.record(tx, {
        tenantId: row.tenantId,
        entityType: 'STUDENT',
        entityId: id,
        type: 'student.archived',
      });
      await this.analytics.track(tx, 'student.archived', {});
    });
    return this.get(id);
  }

  async restore(id: string, input: { version: number }): Promise<Student> {
    await this.db.$transaction(async (tx) => {
      const row = await tx.student.findFirst({
        where: { AND: [{ id }, this.scope('student.archive')] },
        select: { tenantId: true, status: true, archivedAt: true },
      });
      if (!row) throw new DomainError('NOT_FOUND', 'student');
      if (!row.archivedAt) throw new DomainError('INVALID_STATE_TRANSITION', 'not archived');
      if (Date.now() - row.archivedAt.getTime() > RESTORE_WINDOW_DAYS * DAY_MS)
        throw new DomainError('INVALID_STATE_TRANSITION', 'restore window passed', [
          { path: 'archivedAt', issue: 'restore_window_passed' },
        ]);
      if (SEATED.has(row.status)) await this.entitlements.assertWithinLimit('students', 1, tx);
      await this.bumpVersion(tx, id, input.version, { archivedAt: null });
      await this.audit.record(
        { action: 'student.restored', entityType: 'Student', entityId: id },
        tx,
      );
      await this.activity.record(tx, {
        tenantId: row.tenantId,
        entityType: 'STUDENT',
        entityId: id,
        type: 'student.restored',
      });
      await this.analytics.track(tx, 'student.restored', {});
    });
    return this.get(id);
  }

  /** The student, in scope for `capability` and not archived (archived students are read-only). */
  async loadForWrite(tx: TransactionClient, id: string, capability: StudentCapability) {
    const row = await tx.student.findFirst({
      where: { AND: [{ id }, this.scope(capability)] },
      select: { id: true, tenantId: true, status: true, archivedAt: true, customFields: true },
    });
    if (!row) throw new DomainError('NOT_FOUND', 'student');
    if (row.archivedAt)
      throw new DomainError('INVALID_STATE_TRANSITION', 'student archived', [
        { path: 'archivedAt', issue: 'archived' },
      ]);
    return row;
  }

  /** The student exists in the caller's `student.read` scope (for sub-resources), else 404. */
  async assertReadable(id: string): Promise<{ tenantId: string }> {
    const row = await this.db.student.findFirst({
      where: { AND: [{ id }, this.scope('student.read')] },
      select: { tenantId: true },
    });
    if (!row) throw new DomainError('NOT_FOUND', 'student');
    return row;
  }

  scope(capability: StudentCapability | 'student.health.read' | 'student.health.manage') {
    return scopedWhere(this.cls, capability, studentPolicy) as Prisma.StudentWhereInput;
  }

  private canRead(capability: string): boolean {
    const caps = this.cls.get('membership')?.capabilities as Record<string, unknown> | undefined;
    return caps?.[capability] !== undefined;
  }

  private async bumpVersion(
    tx: TransactionClient,
    id: string,
    version: number,
    data: Prisma.StudentUpdateManyMutationInput,
  ): Promise<void> {
    const updated = await tx.student.updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
  }

  private async context() {
    const tenantId = this.cls.get('tenantId');
    const membership = this.cls.get('membership');
    if (!tenantId || !membership) throw new DomainError('UNAUTHENTICATED');
    const [tenant, branch] = await Promise.all([
      this.db.tenant.findFirst({ select: { timezone: true } }),
      // A member limited to branches adds students to their first branch (C-07).
      membership.branchIds.length
        ? this.db.branch.findFirst({
            where: { id: membership.branchIds[0]! },
            select: { id: true },
          })
        : this.db.branch.findFirst({ where: { isDefault: true }, select: { id: true } }),
    ]);
    if (!tenant || !branch) throw new DomainError('NOT_FOUND', 'academy');
    return {
      tenantId,
      membershipId: membership.id,
      branchId: branch.id,
      today: localDate(new Date(), tenant.timezone),
    };
  }
}

/**
 * Search (C-105): name or preferred name contains the text (trigram index), admission number
 * starts with it, or — with 4+ digits — a parent's phone contains them.
 */
export function searchWhere(q: string): Prisma.StudentWhereInput {
  const digits = q.replace(/\D/g, '');
  return {
    OR: [
      { fullName: { contains: q, mode: 'insensitive' } },
      { preferredName: { contains: q, mode: 'insensitive' } },
      { admissionNo: { startsWith: q, mode: 'insensitive' } },
      ...(digits.length >= 4
        ? [{ parents: { some: { parent: { phone: { contains: digits } } } } }]
        : []),
    ],
  };
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00Z`) : null;
}

/** JSON columns: an object, or SQL NULL when cleared. */
function jsonOrNull(
  value: Prisma.InputJsonObject | null | undefined,
): Prisma.InputJsonObject | typeof Prisma.DbNull {
  return value ?? Prisma.DbNull;
}
