import {
  addDays,
  type FeeEffects,
  type FeeEffectsQuery,
  localDate,
  newId,
  type SwitchFeeAssignment,
  type SwitchFeeAssignmentResult,
} from '@academybee/contracts';
import { createServerTranslator } from '@academybee/i18n';
import type { TenantBoundClient, TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { AuditService } from '../../core/audit/audit.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { assertInScope, scopedWhere } from '../../core/rbac/scope.js';
import { StudentsService } from '../people/index.js';
import { cycleAt, type Cycle, daysInclusive } from './domain/cycles.js';
import { balanceOf, prorate } from './domain/money.js';
import { FeeAssignmentsService } from './fee-assignments.service.js';
import { FeePlansService } from './fee-plans.service.js';
import { feeAssignmentPolicy } from './finance.policy.js';
import { InvoicesService } from './invoices.service.js';

const at = (d: string) => new Date(`${d}T00:00:00Z`);
const day = (d: Date) => d.toISOString().slice(0, 10);

/** What the cycle holding `date` has billed, and the share of it from `date` on (G-27). */
const unusedShare = (billedMinor: number, cycle: Cycle, date: string) =>
  date <= cycle.start
    ? billedMinor
    : prorate(billedMinor, daysInclusive(date, cycle.end), daysInclusive(cycle.start, cycle.end));

/**
 * What a transfer or status change does to a student's fees (G-27). The preview answers before
 * anyone confirms; billing itself follows the student's status without further steps, and
 * nothing already invoiced changes. Moving a fee to another plan is its own explicit action.
 */
@Injectable()
export class FeeEffectsService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly audit: AuditService,
    private readonly students: StudentsService,
    private readonly invoices: InvoicesService,
    private readonly plans: FeePlansService,
    private readonly assignments: FeeAssignmentsService,
  ) {}

  private async today() {
    const tenant = await this.db.tenant.findFirst({ select: { timezone: true } });
    return localDate(new Date(), tenant?.timezone ?? 'Asia/Kolkata');
  }

  private billedFor(
    db: Pick<TransactionClient, 'invoice'>,
    assignmentId: string,
    cycle: Cycle,
  ): Promise<{ _sum: { totalMinor: number | null } }> {
    return db.invoice.aggregate({
      where: {
        assignmentId,
        cycleStart: at(cycle.start),
        status: { notIn: ['CANCELLED', 'DRAFT'] },
      },
      _sum: { totalMinor: true },
    });
  }

  async preview(query: FeeEffectsQuery): Promise<FeeEffects> {
    const [student] = await this.students.forFees(this.db, [query.studentId]);
    assertInScope(this.cls, 'fee.read', feeAssignmentPolicy, { branchId: student!.branchId });
    const date = query.date ?? (await this.today());
    const [rows, open, creditMinor] = await Promise.all([
      this.db.feeAssignment.findMany({
        where: {
          AND: [
            scopedWhere(this.cls, 'fee.read', feeAssignmentPolicy),
            {
              studentId: student!.id,
              status: 'ACTIVE',
              OR: [{ endsOn: null }, { endsOn: { gte: at(date) } }],
            },
          ],
        },
        orderBy: [{ startsOn: 'asc' }, { id: 'asc' }],
        take: 100,
        select: {
          id: true,
          batchId: true,
          startsOn: true,
          plan: { select: { name: true, cycle: true, cycleMonths: true } },
        },
      }),
      this.db.invoice.findMany({
        where: { studentId: student!.id, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
        select: {
          totalMinor: true,
          paidMinor: true,
          creditAppliedMinor: true,
          writtenOffMinor: true,
        },
      }),
      this.invoices.creditBalance(this.db, student!.id),
    ]);
    const items = await Promise.all(
      rows.map(async (r) => {
        const cycle = cycleAt(date, r.plan, day(r.startsOn));
        const billed = await this.billedFor(this.db, r.id, cycle);
        const billedMinor = billed._sum.totalMinor ?? 0;
        return {
          assignmentId: r.id,
          planName: r.plan.name,
          batchId: r.batchId,
          effect: this.effectOf(query, r.batchId),
          cycleStart: cycle.start,
          cycleEnd: cycle.end,
          nextCycleStart: addDays(cycle.end, 1),
          billedMinor,
          unusedMinor: unusedShare(billedMinor, cycle, date),
        };
      }),
    );
    return {
      openBalanceMinor: open.reduce((sum, i) => sum + balanceOf(i), 0),
      creditMinor,
      items,
    };
  }

  private effectOf(query: FeeEffectsQuery, batchId: string | null) {
    switch (query.change) {
      case 'ON_HOLD':
        return 'PAUSES' as const;
      case 'COMPLETED':
      case 'LEFT':
        return 'STOPS' as const;
      case 'ACTIVE':
        return 'RESUMES' as const;
      case 'TRANSFER':
        return batchId === query.fromBatchId ? ('SWITCHABLE' as const) : ('UNCHANGED' as const);
    }
  }

  /** End this fee and start the student on another plan, keeping their discount and instalments. */
  async switchPlan(id: string, input: SwitchFeeAssignment): Promise<SwitchFeeAssignmentResult> {
    const membershipId = this.cls.get('membership')!.id;
    const result = await this.db.$transaction(async (tx) => {
      const old = await tx.feeAssignment.findFirst({
        where: {
          AND: [{ id, status: 'ACTIVE' }, scopedWhere(this.cls, 'fee.manage', feeAssignmentPolicy)],
        },
        select: {
          tenantId: true,
          branchId: true,
          studentId: true,
          planId: true,
          batchId: true,
          startsOn: true,
          endsOn: true,
          discountKind: true,
          discountValue: true,
          discountReason: true,
          instalments: true,
          plan: { select: { cycle: true, cycleMonths: true } },
        },
      });
      if (!old) throw new DomainError('NOT_FOUND', 'fee assignment');
      // One switch per fee: a second one could credit the same unused share again.
      if (old.endsOn)
        throw new DomainError('CONFLICT', 'already ending', [
          { path: 'id', issue: 'already_ending' },
        ]);
      const startsOn = day(old.startsOn);
      if (input.date <= startsOn)
        throw new DomainError('VALIDATION_FAILED', 'before the fee started', [
          { path: 'date', issue: 'before_start' },
        ]);
      const plan = await this.plans.usable(tx, input.toPlanId);
      const cycle = cycleAt(input.date, old.plan, startsOn);
      const newStart = input.mode === 'NEXT_CYCLE' ? addDays(cycle.end, 1) : input.date;
      const oldEnd = addDays(newStart, -1);
      // Already billed past the switch: the new plan would charge that period twice.
      const ahead = await tx.invoice.count({
        where: {
          assignmentId: id,
          cycleStart: { gte: at(newStart) },
          status: { not: 'CANCELLED' },
        },
      });
      if (ahead)
        throw new DomainError('CONFLICT', 'a later cycle is already billed', [
          { path: 'date', issue: 'later_cycle_billed' },
        ]);
      const clash = await tx.feeAssignment.count({
        where: {
          planId: plan.id,
          studentId: old.studentId,
          status: 'ACTIVE',
          id: { not: id },
          OR: [{ endsOn: null }, { endsOn: { gte: at(newStart) } }],
        },
      });
      if (clash || plan.id === old.planId)
        throw new DomainError('CONFLICT', 'already on this plan', [
          { path: 'toPlanId', issue: 'already_assigned' },
        ]);
      const updated = await tx.feeAssignment.updateMany({
        where: { id, version: input.version, status: 'ACTIVE' },
        data: { endsOn: at(oldEnd), version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
      const newAssignmentId = newId();
      await tx.feeAssignment.create({
        data: {
          id: newAssignmentId,
          tenantId: old.tenantId,
          branchId: old.branchId,
          studentId: old.studentId,
          planId: plan.id,
          batchId: input.toBatchId === undefined ? old.batchId : input.toBatchId,
          startsOn: at(newStart),
          discountKind: old.discountKind,
          discountValue: old.discountValue,
          discountReason: old.discountReason,
          instalments: old.instalments,
          createdById: membershipId,
        },
      });
      let creditedMinor = 0;
      if (input.mode === 'PRORATE') {
        const billed = await this.billedFor(tx, id, cycle);
        creditedMinor = unusedShare(billed._sum.totalMinor ?? 0, cycle, input.date);
        if (creditedMinor > 0)
          await this.invoices.addCredit(tx, {
            tenantId: old.tenantId,
            studentId: old.studentId,
            amountMinor: creditedMinor,
            note: createServerTranslator('finance')('notes.planSwitched'),
            createdById: membershipId,
          });
      }
      await this.audit.record(
        {
          action: 'finance.fee_assignment_switched',
          entityType: 'FeeAssignment',
          entityId: id,
          after: { newAssignmentId, toPlanId: plan.id, startsOn: newStart, creditedMinor },
          metadata: { mode: input.mode },
        },
        tx,
      );
      return { newAssignmentId, creditedMinor };
    });
    return {
      assignment: await this.assignments.get(result.newAssignmentId),
      creditedMinor: result.creditedMinor,
    };
  }
}
