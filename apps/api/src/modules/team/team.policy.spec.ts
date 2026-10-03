import { describe, expect, it } from 'vitest';

import { membershipPolicy } from './team.policy.js';

const ctx = { userId: 'u1', membershipId: 'm1', branchIds: ['b1'] };
const row = (userId: string, branchIds: string[]) => ({ id: `m-${userId}`, userId, branchIds });

describe('membershipPolicy (reference scope policy)', () => {
  it('TENANT sees everyone', () => {
    expect(membershipPolicy.where('TENANT', ctx)).toEqual({});
    expect(membershipPolicy.can('TENANT', ctx, row('u2', ['b9']))).toBe(true);
  });

  it('BRANCH sees shared branches and unrestricted members; list and record rules agree', () => {
    expect(membershipPolicy.where('BRANCH', ctx)).toEqual({
      OR: [{ branchIds: { isEmpty: true } }, { branchIds: { hasSome: ['b1'] } }],
    });
    expect(membershipPolicy.can('BRANCH', ctx, row('u2', ['b1', 'b2']))).toBe(true);
    expect(membershipPolicy.can('BRANCH', ctx, row('u2', []))).toBe(true);
    expect(membershipPolicy.can('BRANCH', ctx, row('u2', ['b9']))).toBe(false);
    expect(membershipPolicy.where('BRANCH', { ...ctx, branchIds: [] })).toEqual({});
  });

  it('SELF sees only itself; ASSIGNED and LINKED grant nothing for members', () => {
    expect(membershipPolicy.where('SELF', ctx)).toEqual({ userId: 'u1' });
    expect(membershipPolicy.can('SELF', ctx, row('u2', []))).toBe(false);
    expect(membershipPolicy.where('ASSIGNED', ctx)).toBeNull();
    expect(membershipPolicy.can('LINKED', ctx, row('u1', []))).toBe(false);
  });
});
