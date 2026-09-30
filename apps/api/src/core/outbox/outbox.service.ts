import { newId } from '@academybee/contracts';
import { type Prisma, type TransactionClient } from '@academybee/database';
import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { type RequestContext } from '../context/request-context.js';

export type OutboxEventInput = {
  type: string;
  payload: Prisma.InputJsonValue;
  /** Defaults to the current request's tenant; null for platform events. */
  tenantId?: string | null;
  /** Delay dispatch (e.g. scheduled reminders). */
  availableAt?: Date;
};

/**
 * Transactional outbox (ADR-019): call `write(tx, …)` inside the same transaction as the
 * change. The worker relays committed rows to BullMQ; rolled-back rows never exist.
 */
@Injectable()
export class OutboxService {
  constructor(private readonly cls: ClsService<RequestContext>) {}

  async write(tx: TransactionClient, event: OutboxEventInput): Promise<string> {
    const id = newId();
    const store = this.cls.isActive() ? this.cls.get() : undefined;
    const tenantId = event.tenantId !== undefined ? event.tenantId : store?.tenantId;
    await tx.outboxEvent.create({
      data: {
        id,
        type: event.type,
        payload: event.payload,
        tenantId: tenantId ?? null,
        requestId: store?.requestId ?? null,
        ...(store?.actor ? { actor: store.actor } : {}),
        ...(event.availableAt ? { availableAt: event.availableAt } : {}),
      },
    });
    return id;
  }
}
