import { type AppEnv, FEATURE_FLAGS, type FeatureFlagKey } from '@academybee/contracts';

export type FlagOverride = {
  flagKey: string;
  environment: string | null;
  tenantId: string | null;
  enabled: boolean;
};

/**
 * Most specific wins (ADR-041): environment+tenant > tenant > environment > global override >
 * code default for the environment.
 */
export function resolveFlag(
  key: FeatureFlagKey,
  ctx: { appEnv: AppEnv; tenantId?: string | undefined },
  overrides: readonly FlagOverride[],
): boolean {
  const mine = overrides.filter(
    (o) =>
      o.flagKey === key &&
      (o.environment === null || o.environment === ctx.appEnv) &&
      (o.tenantId === null || o.tenantId === ctx.tenantId),
  );
  const rank = (o: FlagOverride) =>
    (o.tenantId !== null ? 2 : 0) + (o.environment !== null ? 1 : 0);
  const best = mine.sort((a, b) => rank(b) - rank(a))[0];
  return best ? best.enabled : FEATURE_FLAGS[key].defaults[ctx.appEnv];
}
