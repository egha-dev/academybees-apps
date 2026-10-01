import { FEATURE_FLAGS, type FeatureFlagKey } from '@academybee/contracts';
import { type PrismaClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';

import { API_CONFIG } from '../config/config.module.js';
import { type ApiConfig } from '../config/config.schema.js';
import { APP_DB } from '../database/database.module.js';
import { type FlagOverride, resolveFlag } from './resolve-flag.js';

/** Release flags (ADR-041): code registry defaults + database overrides (cached, FLAGS_CACHE_MS). */
@Injectable()
export class FeatureFlagService {
  private cache: { at: number; overrides: FlagOverride[] } | undefined;

  constructor(
    @Inject(APP_DB) private readonly db: PrismaClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  async isEnabled(key: FeatureFlagKey, tenantId?: string): Promise<boolean> {
    return resolveFlag(key, { appEnv: this.config.APP_ENV, tenantId }, await this.overrides());
  }

  async evaluateAll(tenantId?: string): Promise<Record<FeatureFlagKey, boolean>> {
    const overrides = await this.overrides();
    const keys = Object.keys(FEATURE_FLAGS) as FeatureFlagKey[];
    return Object.fromEntries(
      keys.map((k) => [k, resolveFlag(k, { appEnv: this.config.APP_ENV, tenantId }, overrides)]),
    ) as Record<FeatureFlagKey, boolean>;
  }

  /** Drop the cache (tests, and after console changes in later phases). */
  invalidate(): void {
    this.cache = undefined;
  }

  private async overrides(): Promise<FlagOverride[]> {
    if (this.cache && Date.now() - this.cache.at < this.config.FLAGS_CACHE_MS)
      return this.cache.overrides;
    const overrides = await this.db.featureFlagOverride.findMany({
      select: { flagKey: true, environment: true, tenantId: true, enabled: true },
    });
    this.cache = { at: Date.now(), overrides };
    return overrides;
  }
}
