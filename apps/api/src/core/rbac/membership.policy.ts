import { definePolicy } from './scope.js';

type MembershipRow = { id: string; userId: string; branchIds: readonly string[] };

/**
 * Reference policy (Team, ARCHITECTURE §7.2): TENANT sees every member; BRANCH sees members
 * sharing a branch (or unrestricted members, who belong to all branches); SELF sees only itself.
 * ASSIGNED and LINKED grant nothing for team members.
 */
export const membershipPolicy = definePolicy<Record<string, unknown>, MembershipRow>({
  resource: 'Membership',
  where(scope, ctx) {
    switch (scope) {
      case 'TENANT':
        return {};
      case 'BRANCH':
        return ctx.branchIds.length === 0
          ? {}
          : {
              OR: [
                { branchIds: { isEmpty: true } },
                { branchIds: { hasSome: [...ctx.branchIds] } },
              ],
            };
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
        return (
          ctx.branchIds.length === 0 ||
          row.branchIds.length === 0 ||
          row.branchIds.some((b) => ctx.branchIds.includes(b))
        );
      case 'SELF':
        return row.userId === ctx.userId;
      default:
        return false;
    }
  },
});
