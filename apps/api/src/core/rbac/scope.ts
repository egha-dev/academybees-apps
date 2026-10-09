import type { Capability, Scope } from '@academybee/contracts';
import { ClsService } from 'nestjs-cls';

import type { RequestContext } from '../context/request-context.js';
import { DomainError } from '../errors/domain-error.js';

/** Who is asking, for scope policies (ARCHITECTURE §7.2). */
export type ScopeContext = {
  userId: string;
  membershipId: string;
  /** Branches the membership is limited to; empty = every branch. */
  branchIds: readonly string[];
};

/**
 * One rule per resource, used for both lists and single records so they cannot drift apart
 * (ADR-008, prevents IDOR):
 * - `where(scope, ctx)` → a Prisma filter for lists, or `null` when the scope grants nothing;
 * - `can(scope, ctx, record)` → whether one record is visible.
 * Domain policies live next to their modules (`<module>.policy.ts`, Phase 4+).
 */
export type ScopePolicy<Where, Row> = {
  readonly resource: string;
  where(scope: Scope, ctx: ScopeContext): Where | null;
  can(scope: Scope, ctx: ScopeContext, row: Row): boolean;
};

export function definePolicy<Where, Row>(policy: ScopePolicy<Where, Row>): ScopePolicy<Where, Row> {
  return policy;
}

/** The caller's scope for a capability plus their context; throws if not granted. */
export function scopeFor(
  cls: ClsService<RequestContext>,
  capability: Capability,
): { scope: Scope; ctx: ScopeContext } {
  const membership = cls.get('membership');
  const userId = cls.get('userId');
  const scope = membership?.capabilities[capability];
  if (!membership || !userId || !scope) throw new DomainError('FORBIDDEN', `missing ${capability}`);
  return { scope, ctx: { userId, membershipId: membership.id, branchIds: membership.branchIds } };
}

/** List filter for a policy, or a filter that matches nothing when the scope grants nothing. */
export function scopedWhere<Where, Row>(
  cls: ClsService<RequestContext>,
  capability: Capability,
  policy: ScopePolicy<Where, Row>,
): Where | { id: { in: [] } } {
  const { scope, ctx } = scopeFor(cls, capability);
  return policy.where(scope, ctx) ?? { id: { in: [] } };
}

/**
 * Single-record check: a record outside the caller's scope is reported as not found, so its
 * existence never leaks (ADR-008, ARCHITECTURE §9.1).
 */
export function assertInScope<Where, Row>(
  cls: ClsService<RequestContext>,
  capability: Capability,
  policy: ScopePolicy<Where, Row>,
  row: Row | null | undefined,
): Row {
  if (!row) throw new DomainError('NOT_FOUND', `${policy.resource} missing`);
  const { scope, ctx } = scopeFor(cls, capability);
  if (!policy.can(scope, ctx, row))
    throw new DomainError('NOT_FOUND', `${policy.resource} out of scope`);
  return row;
}
