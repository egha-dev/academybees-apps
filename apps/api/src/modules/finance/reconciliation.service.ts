import {
  decodeCursor,
  encodeCursor,
  newId,
  type ReconciliationException,
} from '@academybee/contracts';
import type { Prisma, TenantBoundClient, TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';

import { AuditService } from '../../core/audit/audit.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';

const SELECT = {
  id: true,
  kind: true,
  paymentId: true,
  reference: true,
  details: true,
  status: true,
  resolution: true,
  resolvedAt: true,
  createdAt: true,
} satisfies Prisma.ReconciliationExceptionSelect;
type Row = Prisma.ReconciliationExceptionGetPayload<{ select: typeof SELECT }>;

const toException = (r: Row): ReconciliationException => ({
  id: r.id,
  kind: r.kind,
  paymentId: r.paymentId,
  reference: r.reference,
  details: r.details as ReconciliationException['details'],
  status: r.status,
  resolution: r.resolution,
  resolvedAt: r.resolvedAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
});

/**
 * Where the gateway and our books disagree (§12.3): stored once per problem, for a person with
 * `finance.reconcile` to look at. Nothing here changes money; a resolved row says what was done.
 */
@Injectable()
export class ReconciliationService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly audit: AuditService,
  ) {}

  async record(
    tx: TransactionClient,
    input: {
      tenantId: string;
      accountId: string;
      paymentId?: string;
      kind: ReconciliationException['kind'];
      reference: string;
      details: Record<string, string | number | null>;
    },
  ): Promise<void> {
    await tx.reconciliationException.createMany({
      data: [
        {
          id: newId(),
          tenantId: input.tenantId,
          accountId: input.accountId,
          paymentId: input.paymentId ?? null,
          kind: input.kind,
          reference: input.reference,
          details: input.details,
          dedupeKey: `${input.kind}:${input.reference}`,
        },
      ],
      skipDuplicates: true,
    });
  }

  async list(query: { status: 'OPEN' | 'RESOLVED'; cursor?: string | undefined; limit: number }) {
    const after = query.cursor ? decodeCursor(query.cursor, z.object({ id: z.uuid() })) : null;
    if (query.cursor && !after)
      throw new DomainError('VALIDATION_FAILED', 'bad cursor', [
        { path: 'cursor', issue: 'invalid' },
      ]);
    const rows = await this.db.reconciliationException.findMany({
      where: { status: query.status, ...(after ? { id: { lt: after.id } } : {}) },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      select: SELECT,
    });
    const page = rows.slice(0, query.limit);
    return {
      items: page.map(toException),
      nextCursor:
        rows.length > query.limit ? encodeCursor({ id: page[page.length - 1]!.id }) : null,
    };
  }

  async resolve(id: string, resolution: string): Promise<ReconciliationException> {
    const membershipId = this.cls.get('membership')!.id;
    return this.db.$transaction(async (tx) => {
      const updated = await tx.reconciliationException.updateMany({
        where: { id, status: 'OPEN' },
        data: {
          status: 'RESOLVED',
          resolution,
          resolvedById: membershipId,
          resolvedAt: new Date(),
        },
      });
      const row = await tx.reconciliationException.findFirst({ where: { id }, select: SELECT });
      if (!row) throw new DomainError('NOT_FOUND', 'exception');
      if (updated.count !== 1)
        throw new DomainError('INVALID_STATE_TRANSITION', 'already resolved', [
          { path: 'status', issue: 'resolved' },
        ]);
      await this.audit.record(
        {
          action: 'finance.reconciliation_resolved',
          entityType: 'ReconciliationException',
          entityId: id,
          metadata: { kind: row.kind, resolution },
        },
        tx,
      );
      return toException(row);
    });
  }
}
