import { type CreateFeePlan, type FeePlan, newId, type UpdateFeePlan } from '@academybee/contracts';
import type { Prisma, TenantBoundClient, TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { AuditService } from '../../core/audit/audit.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { scopedWhere } from '../../core/rbac/scope.js';
import { feePlanPolicy } from './finance.policy.js';

const SELECT = {
  id: true,
  name: true,
  cycle: true,
  cycleMonths: true,
  currency: true,
  status: true,
  version: true,
  components: {
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true, amountMinor: true, taxable: true, sortOrder: true },
  },
  _count: { select: { assignments: { where: { status: 'ACTIVE' } } } },
} satisfies Prisma.FeePlanSelect;

type Row = Prisma.FeePlanGetPayload<{ select: typeof SELECT }>;

const toPlan = (r: Row): FeePlan => ({
  id: r.id,
  name: r.name,
  cycle: r.cycle,
  cycleMonths: r.cycleMonths,
  currency: r.currency,
  status: r.status,
  version: r.version,
  components: r.components,
  totalMinor: r.components.reduce((a, c) => a + c.amountMinor, 0),
  assignedCount: r._count.assignments,
});

/** Fee plans and their components (PRD v2 §19, G-04). Academy-wide; versioned; audited. */
@Injectable()
export class FeePlansService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly audit: AuditService,
  ) {}

  private scope(capability: 'fee.read' | 'fee.manage'): Prisma.FeePlanWhereInput {
    return scopedWhere(this.cls, capability, feePlanPolicy);
  }

  async list(status: 'ACTIVE' | 'ARCHIVED'): Promise<{ items: FeePlan[] }> {
    const rows = await this.db.feePlan.findMany({
      where: { AND: [this.scope('fee.read'), { status }] },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 500,
      select: SELECT,
    });
    return { items: rows.map(toPlan) };
  }

  async get(id: string): Promise<FeePlan> {
    const row = await this.db.feePlan.findFirst({
      where: { AND: [{ id }, this.scope('fee.read')] },
      select: SELECT,
    });
    if (!row) throw new DomainError('NOT_FOUND', 'fee plan');
    return toPlan(row);
  }

  /** For other finance services: an ACTIVE plan the caller may use, inside their transaction. */
  async usable(tx: TransactionClient, id: string) {
    const row = await tx.feePlan.findFirst({
      where: { AND: [{ id }, this.scope('fee.manage'), { status: 'ACTIVE' }] },
      select: { id: true, tenantId: true },
    });
    if (!row) throw new DomainError('NOT_FOUND', 'fee plan');
    return row;
  }

  async create(input: CreateFeePlan): Promise<FeePlan> {
    const tenantId = this.cls.get('tenantId')!;
    const id = newId();
    await this.db.$transaction(async (tx) => {
      await tx.feePlan.create({
        data: {
          id,
          tenantId,
          name: input.name,
          cycle: input.cycle,
          cycleMonths: input.cycle === 'CUSTOM' ? (input.cycleMonths ?? null) : null,
        },
      });
      await this.replaceComponents(tx, tenantId, id, input.components);
      await this.audit.record(
        { action: 'finance.fee_plan_created', entityType: 'FeePlan', entityId: id, after: input },
        tx,
      );
    });
    return this.get(id);
  }

  async update(id: string, input: UpdateFeePlan): Promise<FeePlan> {
    await this.db.$transaction(async (tx) => {
      const plan = await tx.feePlan.findFirst({
        where: { AND: [{ id }, this.scope('fee.manage')] },
        select: { tenantId: true, cycle: true, cycleMonths: true },
      });
      if (!plan) throw new DomainError('NOT_FOUND', 'fee plan');
      const cycle = input.cycle ?? plan.cycle;
      const months =
        input.cycleMonths !== undefined ? input.cycleMonths : input.cycle ? null : plan.cycleMonths;
      if ((cycle === 'CUSTOM') !== (months !== null && months !== undefined))
        throw new DomainError('VALIDATION_FAILED', 'cycle months', [
          {
            path: 'cycleMonths',
            issue: cycle === 'CUSTOM' ? 'required_for_custom' : 'only_for_custom',
          },
        ]);
      const updated = await tx.feePlan.updateMany({
        where: { id, version: input.version },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          cycle,
          cycleMonths: months ?? null,
          ...(input.status !== undefined ? { status: input.status } : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
      if (input.components) await this.replaceComponents(tx, plan.tenantId, id, input.components);
      await this.audit.record(
        { action: 'finance.fee_plan_changed', entityType: 'FeePlan', entityId: id, after: input },
        tx,
      );
    });
    return this.get(id);
  }

  private async replaceComponents(
    tx: TransactionClient,
    tenantId: string,
    planId: string,
    components: CreateFeePlan['components'],
  ) {
    await tx.feeComponent.deleteMany({ where: { planId } });
    await tx.feeComponent.createMany({
      data: components.map((c, i) => ({
        id: newId(),
        tenantId,
        planId,
        name: c.name,
        amountMinor: c.amountMinor,
        taxable: c.taxable,
        sortOrder: i,
      })),
    });
  }
}
