import type { Prisma } from '@academybee/database';

import { definePolicy, type ScopeContext } from '../../core/rbac/scope.js';

/** Batches the member teaches (ASSIGNED): a `BatchTeacher` row for their Teacher profile. */
export function taughtBy(ctx: ScopeContext): Prisma.BatchWhereInput {
  return { teachers: { some: { teacher: { membershipId: ctx.membershipId } } } };
}

/**
 * Who sees which batches (ARCHITECTURE §7.2): TENANT all; BRANCH the member's branches (an
 * unrestricted member sees all); ASSIGNED the batches they teach. LINKED/SELF (parents,
 * students) see their own children's or their own batches. Lists and single records both use
 * `where`, so out of scope is simply not found (404).
 */
export const batchPolicy = definePolicy<Prisma.BatchWhereInput, { branchId: string }>({
  resource: 'Batch',
  where(scope, ctx) {
    switch (scope) {
      case 'TENANT':
        return {};
      case 'BRANCH':
        return ctx.branchIds.length === 0 ? {} : { branchId: { in: [...ctx.branchIds] } };
      case 'ASSIGNED':
        return taughtBy(ctx);
      case 'LINKED':
        return {
          enrolments: {
            some: {
              endedOn: null,
              student: { parents: { some: { parent: { userId: ctx.userId, status: 'ACTIVE' } } } },
            },
          },
        };
      case 'SELF':
        return { enrolments: { some: { endedOn: null, student: { userId: ctx.userId } } } };
      default:
        return null;
    }
  },
  can(scope, ctx, row) {
    if (scope === 'TENANT') return true;
    if (scope === 'BRANCH')
      return ctx.branchIds.length === 0 || ctx.branchIds.includes(row.branchId);
    return false; // depends on other rows: use `where`
  },
});

/** Courses follow their batches; courses have no branch, so TENANT/BRANCH see every course. */
export const coursePolicy = definePolicy<Prisma.CourseWhereInput, Record<string, never>>({
  resource: 'Course',
  where(scope, ctx) {
    if (scope === 'TENANT' || scope === 'BRANCH') return {};
    const batches = batchPolicy.where(scope, ctx);
    return batches ? { batches: { some: batches } } : null;
  },
  can(scope) {
    return scope === 'TENANT' || scope === 'BRANCH';
  },
});

/**
 * Class sessions: like their batch, and for ASSIGNED also any session the member was put on to
 * teach (a substitute sees that one class).
 */
export const sessionPolicy = definePolicy<Prisma.ClassSessionWhereInput, { branchId: string }>({
  resource: 'ClassSession',
  where(scope, ctx) {
    if (scope === 'ASSIGNED')
      return {
        OR: [{ teacher: { membershipId: ctx.membershipId } }, { batch: taughtBy(ctx) }],
      };
    const batches = batchPolicy.where(scope, ctx);
    if (!batches) return null;
    if (scope === 'BRANCH')
      return ctx.branchIds.length === 0 ? {} : { branchId: { in: [...ctx.branchIds] } };
    return scope === 'TENANT' ? {} : { batch: batches };
  },
  can(scope, ctx, row) {
    if (scope === 'TENANT') return true;
    if (scope === 'BRANCH')
      return ctx.branchIds.length === 0 || ctx.branchIds.includes(row.branchId);
    return false;
  },
});
