import {
  applyEntitlementOverrides,
  ENTITLEMENT_ISSUES,
  type EntitlementOverride,
  type EntitlementSnapshot,
  type FeatureKey,
  type LimitKey,
  readEntitlementSnapshot,
} from '@academybee/contracts';
import { type TenantBoundClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';

import { TENANT_DB } from '../database/database.module.js';
import { DomainError } from '../errors/domain-error.js';
import { CORE_USAGE_COUNTERS, type TenantDb, type UsageCounter } from './usage.js';

/**
 * What the current academy's plan allows (ADR-028, C-89): its subscription snapshot with platform
 * overrides applied. Reads go through the tenant-bound client, so only the request's academy is
 * ever visible. Limits block creation only, never reading or exporting existing data.
 */
@Injectable()
export class EntitlementService {
  private readonly counters = new Map<LimitKey, UsageCounter>(
    Object.entries(CORE_USAGE_COUNTERS) as [LimitKey, UsageCounter][],
  );

  constructor(@Inject(TENANT_DB) private readonly db: TenantBoundClient) {}

  /** Domain modules register how their limit is counted (e.g. people → students). */
  registerCounter(key: LimitKey, counter: UsageCounter): void {
    this.counters.set(key, counter);
  }

  async current(db: Pick<TenantBoundClient, 'subscription' | 'subscriptionOverride'> = this.db) {
    const [subscription, overrides] = await Promise.all([
      db.subscription.findFirst({ select: { entitlements: true } }),
      db.subscriptionOverride.findMany({
        select: { key: true, kind: true, limit: true, enabled: true },
      }),
    ]);
    // No subscription = nothing granted (fail closed); every provisioned academy has one.
    const snapshot = readEntitlementSnapshot(subscription?.entitlements ?? null);
    return applyEntitlementOverrides(snapshot, overrides.map(toOverride).filter(isDefined));
  }

  async assertFeature(key: FeatureKey, snapshot?: EntitlementSnapshot): Promise<void> {
    const s = snapshot ?? (await this.current());
    if (!s.features[key])
      throw new DomainError('FEATURE_NOT_IN_PLAN', `feature ${key}`, [
        { path: key, issue: ENTITLEMENT_ISSUES.feature },
      ]);
  }

  /** Current usage of a limit, or null when it isn't counted yet. */
  async used(key: LimitKey, db: TenantDb = this.db): Promise<number | null> {
    const counter = this.counters.get(key);
    return counter ? counter(db) : null;
  }

  /**
   * Refuse creating `adding` more items when that would pass the plan's limit. Pass the
   * transaction when creating inside one, so the count and the insert see the same data.
   */
  async assertWithinLimit(
    key: LimitKey,
    adding = 1,
    db: TenantDb & Pick<TenantBoundClient, 'subscription' | 'subscriptionOverride'> = this.db,
  ): Promise<void> {
    const max = (await this.current(db)).limits[key];
    if (max === null) return;
    const used = await this.used(key, db);
    if (used === null) return;
    if (used + adding > max)
      throw new DomainError('ENTITLEMENT_LIMIT_REACHED', `${key}: ${used}+${adding} > ${max}`, [
        { path: key, issue: ENTITLEMENT_ISSUES.limit },
      ]);
  }
}

type OverrideRow = {
  key: string;
  kind: 'LIMIT' | 'FEATURE';
  limit: number | null;
  enabled: boolean | null;
};

function toOverride(row: OverrideRow): EntitlementOverride | undefined {
  // Unknown keys are dropped by readEntitlementSnapshot's shape; keep only well-formed rows.
  if (row.kind === 'LIMIT') return { key: row.key as LimitKey, kind: 'LIMIT', limit: row.limit };
  if (row.enabled === null) return undefined;
  return { key: row.key as FeatureKey, kind: 'FEATURE', enabled: row.enabled };
}

const isDefined = <T>(value: T | undefined): value is T => value !== undefined;
