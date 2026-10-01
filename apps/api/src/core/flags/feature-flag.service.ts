import { FEATURE_FLAGS, type FeatureFlagKey } from '@academybee/contracts';
import { type TenantBoundClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { API_CONFIG } from '../config/config.module.js';
import { type ApiConfig } from '../config/config.schema.js';
import { type RequestContext } from '../context/request-context.js';
import { TENANT_DB } from '../database/database.module.js';
import { type FlagOverride, resolveFlag } from './resolve-flag.js';

/** Release flags (ADR-041): code registry defaults + database overrides (cached, FLAGS_CACHE_MS). */
@Injectable()
export class FeatureFlagService {
  /** Overrides visible to each tenant context (global rows + that tenant's, C-53). */
  private readonly cache = new Map<string, { at: number; overrides: FlagOverride[] }>();

  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  /** Evaluate for the current request's academy (or globally outside an academy). */
  async isEnabled(key: FeatureFlagKey): Promise<boolean> {
    const tenantId = this.currentTenant();
    return resolveFlag(key, { appEnv: this.config.APP_ENV, tenantId }, await this.overrides());
  }

  async evaluateAll(): Promise<Record<FeatureFlagKey, boolean>> {
    const tenantId = this.currentTenant();
    const overrides = await this.overrides();
    const keys = Object.keys(FEATURE_FLAGS) as FeatureFlagKey[];
    return Object.fromEntries(
      keys.map((k) => [k, resolveFlag(k, { appEnv: this.config.APP_ENV, tenantId }, overrides)]),
    ) as Record<FeatureFlagKey, boolean>;
  }

  /** Drop the cache (tests, and after console changes in later phases). */
  invalidate(): void {
    this.cache.clear();
  }

  private currentTenant(): string | undefined {
    return this.cls.isActive() ? this.cls.get('tenantId') : undefined;
  }

  /** Read under the current tenant context, so RLS returns exactly the overrides that apply. */
  private async overrides(): Promise<FlagOverride[]> {
    const cacheKey = this.currentTenant() ?? 'global';
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < this.config.FLAGS_CACHE_MS) return hit.overrides;
    const overrides = await this.db.featureFlagOverride.findMany({
      select: { flagKey: true, environment: true, tenantId: true, enabled: true },
    });
    if (this.cache.size > 10_000) this.cache.clear(); // bounded; entries are tiny and short-lived
    this.cache.set(cacheKey, { at: Date.now(), overrides });
    return overrides;
  }
}
