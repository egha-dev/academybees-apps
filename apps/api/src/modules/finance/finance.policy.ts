import type { Prisma } from '@academybee/database';

import { definePolicy } from '../../core/rbac/scope.js';

/**
 * Who sees which fee assignments (ARCHITECTURE §7.2): TENANT all; BRANCH the member's branches
 * (the assignment carries its student's branch). Parents (LINKED) read only through the Family
 * Hub, where each read checks the parent's consent for that child (C-144) — never this policy.
 */
export const feeAssignmentPolicy = definePolicy<
  Prisma.FeeAssignmentWhereInput,
  { branchId: string }
>({
  resource: 'FeeAssignment',
  where(scope, ctx) {
    if (scope === 'TENANT') return {};
    if (scope === 'BRANCH')
      return ctx.branchIds.length === 0 ? {} : { branchId: { in: [...ctx.branchIds] } };
    return null;
  },
  can(scope, ctx, row) {
    if (scope === 'TENANT') return true;
    if (scope === 'BRANCH')
      return ctx.branchIds.length === 0 || ctx.branchIds.includes(row.branchId);
    return false;
  },
});

/** Fee plans are academy-wide like courses: staff with `fee.*` in any staff scope see them all. */
export const feePlanPolicy = definePolicy<Prisma.FeePlanWhereInput, Record<string, never>>({
  resource: 'FeePlan',
  where(scope) {
    return scope === 'TENANT' || scope === 'BRANCH' ? {} : null;
  },
  can(scope) {
    return scope === 'TENANT' || scope === 'BRANCH';
  },
});

/** Invoices follow the branch they were issued in; parents read through the hub (C-144). */
export const invoicePolicy = definePolicy<Prisma.InvoiceWhereInput, { branchId: string }>({
  resource: 'Invoice',
  where(scope, ctx) {
    if (scope === 'TENANT') return {};
    if (scope === 'BRANCH')
      return ctx.branchIds.length === 0 ? {} : { branchId: { in: [...ctx.branchIds] } };
    return null;
  },
  can(scope, ctx, row) {
    if (scope === 'TENANT') return true;
    if (scope === 'BRANCH')
      return ctx.branchIds.length === 0 || ctx.branchIds.includes(row.branchId);
    return false;
  },
});
