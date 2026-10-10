import {
  type ActivityType,
  type CursorPage,
  type CursorPageQuery,
  decodeCursor,
  encodeCursor,
  newId,
} from '@academybee/contracts';
import type { TenantBoundClient, TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';

import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';

export type ActivityEntity = 'STUDENT' | 'PARENT' | 'TEACHER';
type ActivityData = Record<string, string | number | boolean | null>;

export type ActivityItem = {
  id: string;
  type: ActivityType;
  at: string;
  actorName: string | null;
  data: ActivityData;
};

const CursorKeys = z.object({ at: z.string(), id: z.uuid() });

/**
 * The user-facing timeline (UX §9.3, ADR-027): one row per meaningful change, written in the same
 * transaction as the change. Separate from the audit log, and `data` never holds health or
 * contact details — callers pass field names and statuses, not values.
 */
@Injectable()
export class ActivityService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  async record(
    tx: TransactionClient,
    entry: {
      tenantId: string;
      entityType: ActivityEntity;
      entityId: string;
      type: ActivityType;
      data?: ActivityData;
    },
  ): Promise<void> {
    await tx.activityEvent.create({
      data: {
        id: newId(),
        tenantId: entry.tenantId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        type: entry.type,
        actorMembershipId: this.cls.isActive() ? (this.cls.get('membership')?.id ?? null) : null,
        data: entry.data ?? {},
      },
    });
  }

  /** Newest first. The caller has already checked the entity is in scope. */
  async page(
    entityType: ActivityEntity,
    entityId: string,
    query: CursorPageQuery,
  ): Promise<CursorPage<ActivityItem>> {
    const after = query.cursor ? decodeCursor(query.cursor, CursorKeys) : undefined;
    if (after === null) throw new DomainError('VALIDATION_FAILED', 'bad cursor');
    const rows = await this.db.activityEvent.findMany({
      where: {
        entityType,
        entityId,
        ...(after
          ? {
              OR: [
                { at: { lt: new Date(after.at) } },
                { at: new Date(after.at), id: { lt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: { id: true, type: true, at: true, actorMembershipId: true, data: true },
    });
    const page = rows.slice(0, query.limit);
    const actorIds = [
      ...new Set(page.map((r) => r.actorMembershipId).filter((v): v is string => !!v)),
    ];
    const actors = actorIds.length
      ? await this.db.membership.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, user: { select: { name: true } } },
        })
      : [];
    const names = new Map(actors.map((a) => [a.id, a.user.name]));
    const last = page.at(-1);
    return {
      items: page.map((r) => ({
        id: r.id,
        type: r.type as ActivityType,
        at: r.at.toISOString(),
        actorName: r.actorMembershipId ? (names.get(r.actorMembershipId) ?? null) : null,
        data: (r.data ?? {}) as ActivityData,
      })),
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor({ at: last.at.toISOString(), id: last.id })
          : null,
    };
  }
}
