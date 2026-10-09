import type { FeatureKey, LimitKey } from '@academybee/contracts';
import { SetMetadata } from '@nestjs/common';

export const REQUIRED_FEATURE = 'academybee:feature';
export const REQUIRED_LIMIT = 'academybee:limit';

/** How many items a request adds (default 1), read from the validated request body. */
export type LimitAdding = (body: unknown) => number;
export type LimitRequirement = { key: LimitKey; adding?: LimitAdding };

/**
 * The plan feature a route needs (ADR-028). Checked after `@Can` (ARCHITECTURE §9.2); refused with
 * `403 FEATURE_NOT_IN_PLAN`. Never used for payments (G-30).
 */
export const Feature = (key: FeatureKey) => SetMetadata(REQUIRED_FEATURE, key);

/**
 * The plan limit a creating route counts against (ADR-028). Refused with
 * `403 ENTITLEMENT_LIMIT_REACHED` when the academy would exceed it. Only creation is limited:
 * reads and exports never are. Services that create in bulk or in a long transaction call
 * `EntitlementService.assertWithinLimit` themselves inside it.
 */
export const Limit = (key: LimitKey, adding?: LimitAdding) =>
  SetMetadata(REQUIRED_LIMIT, (adding ? { key, adding } : { key }) satisfies LimitRequirement);
