import {
  ATTENDANCE_NUDGE_MINUTES,
  localDate,
  newId,
  type Notification,
} from '@academybee/contracts';
import type { Prisma, TenantBoundClient, TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { AnalyticsService } from '../../core/analytics/analytics.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { localTime, SessionsService } from '../scheduling/index.js';

const SELECT = {
  id: true,
  kind: true,
  params: true,
  link: true,
  createdAt: true,
  readAt: true,
} satisfies Prisma.NotificationSelect;
type Row = Prisma.NotificationGetPayload<{ select: typeof SELECT }>;

const toNotification = (r: Row): Notification => ({
  id: r.id,
  kind: r.kind,
  params: (r.params ?? {}) as Notification['params'],
  link: r.link,
  createdAt: r.createdAt.toISOString(),
  readAt: r.readAt?.toISOString() ?? null,
});

/**
 * In-app notifications for staff (Phase 6; C-04, C-128): each member reads and clears only their
 * own. Jobs write them (the G-16 attendance nudge for now); Phase 10 adds push and WhatsApp.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly sessions: SessionsService,
    private readonly analytics: AnalyticsService,
  ) {}

  private me(): string {
    const membership = this.cls.get('membership');
    if (!membership) throw new DomainError('NOT_FOUND', 'no membership');
    return membership.id;
  }

  /** Mine, newest first (keyset on the time-ordered id). */
  async list(query: { limit: number; cursor?: string | undefined }) {
    const rows = await this.db.notification.findMany({
      where: {
        recipientId: this.me(),
        ...(query.cursor && /^[0-9a-f-]{36}$/i.test(query.cursor)
          ? { id: { lt: query.cursor } }
          : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      select: SELECT,
    });
    const items = rows.slice(0, query.limit).map(toNotification);
    return { items, nextCursor: rows.length > query.limit ? items.at(-1)!.id : null };
  }

  async unread() {
    return {
      count: await this.db.notification.count({ where: { recipientId: this.me(), readAt: null } }),
    };
  }

  async markRead(input: { ids?: string[] | undefined; all?: true | undefined }) {
    const me = this.me();
    return this.db.$transaction(async (tx) => {
      const updated = await tx.notification.updateMany({
        where: { recipientId: me, readAt: null, ...(input.ids ? { id: { in: input.ids } } : {}) },
        data: { readAt: new Date() },
      });
      if (updated.count > 0)
        await this.analytics.track(tx, 'notification.read', {
          count: updated.count,
          all: input.all === true,
        });
      return { count: updated.count };
    });
  }

  /**
   * G-16: remind the teacher of each class that ended more than 30 minutes ago (within the last
   * day) without a roll call — once per class (dedupe key), never for cancelled classes.
   */
  async nudge(tx: TransactionClient, now = new Date()): Promise<number> {
    const { timeZone } = await this.sessions.zone(tx);
    const due = await this.sessions.endedWithoutRollCall(tx, {
      endedAfter: new Date(now.getTime() - 24 * 3_600_000),
      endedBefore: new Date(now.getTime() - ATTENDANCE_NUDGE_MINUTES * 60_000),
    });
    const data = due
      .filter((s) => s.remind)
      .map((s) => ({
        id: newId(),
        tenantId: s.tenantId,
        recipientId: s.remind!,
        kind: 'ATTENDANCE_NOT_TAKEN' as const,
        params: {
          batch: s.batchName,
          date: localDate(s.startsAt, timeZone),
          start: localTime(s.startsAt, timeZone),
        },
        link: `/teach/attendance?session=${s.id}`,
        dedupeKey: `attendance-not-taken:${s.id}`,
      }));
    if (!data.length) return 0;
    const created = await tx.notification.createMany({ data, skipDuplicates: true });
    return created.count;
  }
}
