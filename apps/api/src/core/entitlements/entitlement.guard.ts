import { type FeatureKey } from '@academybee/contracts';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  type LimitRequirement,
  REQUIRED_FEATURE,
  REQUIRED_LIMIT,
} from './entitlement.decorators.js';
import { EntitlementService } from './entitlement.service.js';

/**
 * `@Feature` / `@Limit` (ARCHITECTURE §9.2: … PermissionGuard → EntitlementGuard). Runs after the
 * capability check, so a caller without the capability learns nothing about the plan.
 */
@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const feature = this.reflector.getAllAndOverride<FeatureKey | undefined>(
      REQUIRED_FEATURE,
      targets,
    );
    const limit = this.reflector.getAllAndOverride<LimitRequirement | undefined>(
      REQUIRED_LIMIT,
      targets,
    );
    if (!feature && !limit) return true;

    const snapshot = await this.entitlements.current();
    if (feature) await this.entitlements.assertFeature(feature, snapshot);
    if (limit) {
      const body: unknown = context.switchToHttp().getRequest<{ body?: unknown }>().body;
      const adding = Math.max(1, Math.trunc(limit.adding?.(body) ?? 1) || 1);
      await this.entitlements.assertWithinLimit(limit.key, adding);
    }
    return true;
  }
}
