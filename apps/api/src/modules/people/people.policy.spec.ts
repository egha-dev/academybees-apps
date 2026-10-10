import { describe, expect, it } from 'vitest';

import { parentPolicy, studentPolicy } from './people.policy.js';

const ctx = { userId: 'u1', membershipId: 'm1', branchIds: [] as string[] };
const limited = { ...ctx, branchIds: ['b1'] };

describe('student scope policy (ARCHITECTURE §7.2)', () => {
  it('TENANT sees everyone; BRANCH only the member’s branches (all when unrestricted)', () => {
    expect(studentPolicy.where('TENANT', ctx)).toEqual({});
    expect(studentPolicy.where('BRANCH', ctx)).toEqual({});
    expect(studentPolicy.where('BRANCH', limited)).toEqual({ branchId: { in: ['b1'] } });
    expect(studentPolicy.can('BRANCH', limited, { branchId: 'b2', userId: null })).toBe(false);
    expect(studentPolicy.can('BRANCH', limited, { branchId: 'b1', userId: null })).toBe(true);
  });

  it('ASSIGNED = an open enrolment in a batch the member teaches', () => {
    expect(studentPolicy.where('ASSIGNED', ctx)).toEqual({
      enrolments: {
        some: {
          endedOn: null,
          batch: { teachers: { some: { teacher: { membershipId: 'm1' } } } },
        },
      },
    });
    // Depends on other rows: never answered from the row alone.
    expect(studentPolicy.can('ASSIGNED', ctx, { branchId: 'b1', userId: null })).toBe(false);
  });

  it('LINKED = children of the signed-in parent; SELF = the student’s own record', () => {
    expect(studentPolicy.where('LINKED', ctx)).toEqual({
      parents: { some: { parent: { userId: 'u1', status: 'ACTIVE' } } },
    });
    expect(studentPolicy.where('SELF', ctx)).toEqual({ userId: 'u1' });
    expect(studentPolicy.can('SELF', ctx, { branchId: 'b1', userId: 'u2' })).toBe(false);
  });

  it('parents are seen through children in scope (or themselves, LINKED)', () => {
    expect(parentPolicy.where('TENANT', ctx)).toEqual({});
    expect(parentPolicy.where('LINKED', ctx)).toEqual({ userId: 'u1' });
    expect(parentPolicy.where('BRANCH', limited)).toEqual({
      children: { some: { student: { branchId: { in: ['b1'] } } } },
    });
  });
});
