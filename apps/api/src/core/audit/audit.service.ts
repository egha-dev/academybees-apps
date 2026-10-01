import { newId } from '@academybee/contracts';
import { type Prisma, type PrismaClient, type TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { type RequestContext } from '../context/request-context.js';
import { TENANT_DB } from '../database/database.module.js';

export type AuditEntry = {
  /** `area.verb`, e.g. `invoice.cancel`, `auth.login_failed`. */
  action: string;
  entityType?: string;
  entityId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  /** Defaults to the request tenant; null for platform actions. */
  tenantId?: string | null;
};

/**
 * Append-only audit trail (ADR-027). Pass `tx` to record inside the business transaction
 * (the audit row commits or rolls back with the change). The DB forbids UPDATE/DELETE.
 */
@Injectable()
export class AuditService {
  constructor(
    @Inject(TENANT_DB) private readonly db: PrismaClient,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  async record(entry: AuditEntry, tx?: TransactionClient): Promise<string> {
    const id = newId();
    const store = this.cls.isActive() ? this.cls.get() : undefined;
    const actor = store?.actor ?? { type: 'SYSTEM' as const };
    await (tx ?? this.db).auditLog.create({
      data: {
        id,
        tenantId: entry.tenantId !== undefined ? entry.tenantId : (store?.tenantId ?? null),
        actorType: actor.type,
        actorId: actor.id ?? null,
        action: entry.action,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        requestId: store?.requestId ?? null,
        ip: store?.ip ?? null,
        userAgent: store?.userAgent ?? null,
        ...(entry.before !== undefined ? { before: entry.before } : {}),
        ...(entry.after !== undefined ? { after: entry.after } : {}),
        ...(entry.metadata !== undefined ? { metadata: entry.metadata } : {}),
      },
    });
    return id;
  }
}
