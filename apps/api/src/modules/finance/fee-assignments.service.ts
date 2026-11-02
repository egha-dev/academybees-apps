import {
  type CreateFeeAssignments,
  type DiscountInput,
  type FeeAssignment,
  newId,
  type UpdateFeeAssignment,
} from '@academybee/contracts';
import type { Prisma, TenantBoundClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { AuditService } from '../../core/audit/audit.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { assertInScope, scopedWhere } from '../../core/rbac/scope.js';
import { EnrolmentsService, StudentsService } from '../people/index.js';
import { FeePlansService } from './fee-plans.service.js';
import { feeAssignmentPolicy } from './finance.policy.js';

const at = (d: string) => new Date(`${d}T00:00:00Z`);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const SELECT = {
  id: true,
  studentId: true,
  student: { select: { fullName: true } },
  planId: true,
  plan: { select: { name: true } },
  batchId: true,
  startsOn: true,
  endsOn: true,
  discountKind: true,
  discountValue: true,
  discountReason: true,
  instalments: true,
  status: true,
  version: true,
} satisfies Prisma.FeeAssignmentSelect;

type Row = Prisma.FeeAssignmentGetPayload<{ select: typeof SELECT }>;

const toAssignment = (r: Row): FeeAssignment => ({
  id: r.id,
  studentId: r.studentId,
  studentName: r.student.fullName,
  planId: r.planId,
  planName: r.plan.name,
  batchId: r.batchId,
  startsOn: day(r.startsOn)!,
  endsOn: day(r.endsOn),
  discount:
    r.discountKind && r.discountValue !== null
      ? { kind: r.discountKind, value: r.discountValue }
      : null,
  discountReason: r.discountReason,
  instalments: r.instalments,
  status: r.status,
  version: r.version,
});

const discountData = (d: DiscountInput | null | undefined) =>
  d === undefined ? {} : { discountKind: d?.kind ?? null, discountValue: d?.value ?? null };

/**
 * Students on fee plans (G-04, G-27): who pays what from when, with their own discount and
 * instalments. One student may be on several plans (tuition and transport) but not on the same
 * plan twice over the same dates. Invoices are made from these in S3.
 */
@Injectable()
export class FeeAssignmentsService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly audit: AuditService,
    private readonly plans: FeePlansService,
    private readonly students: StudentsService,
    private readonly enrolments: EnrolmentsService,
  ) {}

  private scope(capability: 'fee.read' | 'fee.manage'): Prisma.FeeAssignmentWhereInput {
    return scopedWhere(this.cls, capability, feeAssignmentPolicy);
  }

  async list(query: {
    studentId?: string | undefined;
    planId?: string | undefined;
    batchId?: string | undefined;
    status: 'ACTIVE' | 'ARCHIVED';
  }): Promise<{ items: FeeAssignment[] }> {
    const rows = await this.db.feeAssignment.findMany({
      where: {
        AND: [
          this.scope('fee.read'),
          { status: query.status },
          query.studentId ? { studentId: query.studentId } : {},
          query.planId ? { planId: query.planId } : {},
          query.batchId ? { batchId: query.batchId } : {},
        ],
      },
      orderBy: [{ startsOn: 'desc' }, { id: 'asc' }],
      take: 1000,
      select: SELECT,
    });
    return { items: rows.map(toAssignment) };
  }

  async get(id: string): Promise<FeeAssignment> {
    const row = await this.db.feeAssignment.findFirst({
      where: { AND: [{ id }, this.scope('fee.read')] },
      select: SELECT,
    });
    if (!row) throw new DomainError('NOT_FOUND', 'fee assignment');
    return toAssignment(row);
  }

  /** Put the listed students — or everyone in `batchId` on `startsOn` — on a plan. */
  async create(input: CreateFeeAssignments): Promise<{ items: FeeAssignment[] }> {
    const membershipId = this.cls.get('membership')!.id;
    // A batch must be readable; with no list, its roster on the start date is the list.
    const roster = input.batchId
      ? await this.enrolments.roster(input.batchId, input.startsOn)
      : null;
    const studentIds = input.studentIds ?? roster!.items.map((e) => e.studentId);
    if (!studentIds.length)
      throw new DomainError('VALIDATION_FAILED', 'nobody to assign', [
        { path: 'batchId', issue: 'no_students' },
      ]);
    const ids = await this.db.$transaction(async (tx) => {
      const plan = await this.plans.usable(tx, input.planId);
      const students = await this.students.forFees(tx, studentIds);
      for (const s of students) {
        assertInScope(this.cls, 'fee.manage', feeAssignmentPolicy, { branchId: s.branchId });
        if (s.status === 'LEFT' || s.status === 'COMPLETED')
          throw new DomainError('INVALID_STATE_TRANSITION', 'student not active', [
            { path: `studentIds.${s.id}`, issue: 'student_inactive' },
          ]);
      }
      // Not on this plan twice over the same dates.
      const overlapping = await tx.feeAssignment.findMany({
        where: {
          planId: plan.id,
          status: 'ACTIVE',
          studentId: { in: students.map((s) => s.id) },
          ...(input.endsOn ? { startsOn: { lte: at(input.endsOn) } } : {}),
          OR: [{ endsOn: null }, { endsOn: { gte: at(input.startsOn) } }],
        },
        select: { studentId: true },
      });
      if (overlapping.length)
        throw new DomainError(
          'CONFLICT',
          'already on this plan',
          [...new Set(overlapping.map((o) => o.studentId))].map((id) => ({
            path: `studentIds.${id}`,
            issue: 'already_assigned',
          })),
        );
      const rows = students.map((s) => ({
        id: newId(),
        tenantId: plan.tenantId,
        branchId: s.branchId,
        studentId: s.id,
        planId: plan.id,
        batchId: input.batchId ?? null,
        startsOn: at(input.startsOn),
        endsOn: input.endsOn ? at(input.endsOn) : null,
        ...discountData(input.discount ?? null),
        discountReason: input.discountReason ?? null,
        instalments: input.instalments ?? null,
        createdById: membershipId,
      }));
      await tx.feeAssignment.createMany({ data: rows });
      await this.audit.record(
        {
          action: 'finance.fees_assigned',
          entityType: 'FeePlan',
          entityId: plan.id,
          after: { ...input, studentIds: rows.map((r) => r.studentId) },
        },
        tx,
      );
      return rows.map((r) => r.id);
    });
    const rows = await this.db.feeAssignment.findMany({
      where: { id: { in: ids } },
      orderBy: [{ student: { fullName: 'asc' } }, { id: 'asc' }],
      select: SELECT,
    });
    return { items: rows.map(toAssignment) };
  }

  /** End, archive or change the terms; invoices already made keep what they say. */
  async update(id: string, input: UpdateFeeAssignment): Promise<FeeAssignment> {
    await this.db.$transaction(async (tx) => {
      const row = await tx.feeAssignment.findFirst({
        where: { AND: [{ id }, this.scope('fee.manage')] },
        select: { startsOn: true },
      });
      if (!row) throw new DomainError('NOT_FOUND', 'fee assignment');
      if (input.endsOn && input.endsOn < day(row.startsOn)!)
        throw new DomainError('VALIDATION_FAILED', 'ends before start', [
          { path: 'endsOn', issue: 'before_start' },
        ]);
      const updated = await tx.feeAssignment.updateMany({
        where: { id, version: input.version },
        data: {
          ...(input.endsOn !== undefined ? { endsOn: input.endsOn ? at(input.endsOn) : null } : {}),
          ...discountData(input.discount),
          ...(input.discountReason !== undefined ? { discountReason: input.discountReason } : {}),
          ...(input.instalments !== undefined ? { instalments: input.instalments } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
      await this.audit.record(
        {
          action: 'finance.fee_assignment_changed',
          entityType: 'FeeAssignment',
          entityId: id,
          after: input,
        },
        tx,
      );
    });
    return this.get(id);
  }
}
