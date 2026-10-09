import { type LimitKey, STAFF_ROLE_KEYS } from '@academybee/contracts';
import { type TenantBoundClient } from '@academybee/database';

/** Something that can run tenant-scoped queries: the tenant-bound client or a transaction on it. */
export type TenantDb = Pick<TenantBoundClient, 'membership' | 'branch' | 'student'>;

/**
 * How much of each limit the current academy uses. A limit without a counter is not enforced yet
 * (`storageMb` with uploads beyond branding, `messagesPerMonth` with channels in Phase 10).
 */
export type UsageCounter = (db: TenantDb) => Promise<number>;

export const CORE_USAGE_COUNTERS: Partial<Record<LimitKey, UsageCounter>> = {
  // Staff: memberships that aren't disabled and hold a staff role (parents/students don't count).
  staff: (db) =>
    db.membership.count({
      where: {
        status: { not: 'DISABLED' },
        roles: { some: { role: { key: { in: [...STAFF_ROLE_KEYS] } } } },
      },
    }),
  branches: (db) => db.branch.count({ where: { status: 'ACTIVE' } }),
  // Students who take a seat: active or on hold (completed and left ones don't count).
  students: (db) =>
    db.student.count({ where: { status: { in: ['ACTIVE', 'ON_HOLD'] }, archivedAt: null } }),
};
