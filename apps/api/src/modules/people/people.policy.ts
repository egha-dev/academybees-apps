import type { Prisma } from '@academybee/database';

import { definePolicy, type ScopeContext } from '../../core/rbac/scope.js';

/**
 * Who sees which students (ARCHITECTURE §7.2, ADR-008):
 * - TENANT: every student;
 * - BRANCH: students of the member's branches (an unrestricted member sees all);
 * - ASSIGNED: students with an open enrolment in a batch the member teaches (`BatchTeacher` →
 *   their `Teacher` profile);
 * - LINKED: children of the signed-in parent (`ParentStudent` → `Parent.userId`);
 * - SELF: the signed-in student's own record.
 *
 * Lists **and** single records use `where` (`findFirst({ id, ...where })`), so the two can never
 * drift apart: a student outside the scope is simply not found (404). `can` answers only from the
 * row's own columns and is used where a full row is already loaded (TENANT / BRANCH / SELF).
 */
export const studentPolicy = definePolicy<
  Prisma.StudentWhereInput,
  { branchId: string; userId: string | null }
>({
  resource: 'Student',
  where(scope, ctx) {
    switch (scope) {
      case 'TENANT':
        return {};
      case 'BRANCH':
        return ctx.branchIds.length === 0 ? {} : { branchId: { in: [...ctx.branchIds] } };
      case 'ASSIGNED':
        return { enrolments: { some: assignedEnrolment(ctx) } };
      case 'LINKED':
        return { parents: { some: { parent: { userId: ctx.userId, status: 'ACTIVE' } } } };
      case 'SELF':
        return { userId: ctx.userId };
      default:
        return null;
    }
  },
  can(scope, ctx, row) {
    switch (scope) {
      case 'TENANT':
        return true;
      case 'BRANCH':
        return ctx.branchIds.length === 0 || ctx.branchIds.includes(row.branchId);
      case 'SELF':
        return row.userId === ctx.userId;
      default:
        // ASSIGNED / LINKED depend on other rows: check with `where` instead.
        return false;
    }
  },
});

/** An open enrolment in a batch the member teaches (ASSIGNED). */
function assignedEnrolment(ctx: ScopeContext): Prisma.BatchEnrolmentWhereInput {
  return {
    endedOn: null,
    batch: { teachers: { some: { teacher: { membershipId: ctx.membershipId } } } },
  };
}

/**
 * Parents are seen through their children: a parent is in scope when at least one of their
 * children is (`parent.read` with the same scope rules), or — for LINKED — when it is the
 * signed-in parent themself.
 */
export const parentPolicy = definePolicy<Prisma.ParentWhereInput, Record<string, never>>({
  resource: 'Parent',
  where(scope, ctx) {
    if (scope === 'TENANT') return {};
    if (scope === 'LINKED') return { userId: ctx.userId };
    const students = studentPolicy.where(scope, ctx);
    return students ? { children: { some: { student: students } } } : null;
  },
  can(scope) {
    return scope === 'TENANT';
  },
});

/**
 * Teachers: TENANT all; BRANCH the member's branches; SELF only their own profile (a teacher sees
 * themself, ARCHITECTURE §7.3 "read self").
 */
export const teacherPolicy = definePolicy<
  Prisma.TeacherWhereInput,
  { branchId: string; membershipId: string | null }
>({
  resource: 'Teacher',
  where(scope, ctx) {
    switch (scope) {
      case 'TENANT':
        return {};
      case 'BRANCH':
        return ctx.branchIds.length === 0 ? {} : { branchId: { in: [...ctx.branchIds] } };
      case 'SELF':
        return { membershipId: ctx.membershipId };
      default:
        return null;
    }
  },
  can(scope, ctx, row) {
    switch (scope) {
      case 'TENANT':
        return true;
      case 'BRANCH':
        return ctx.branchIds.length === 0 || ctx.branchIds.includes(row.branchId);
      case 'SELF':
        return row.membershipId === ctx.membershipId;
      default:
        return false;
    }
  },
});
