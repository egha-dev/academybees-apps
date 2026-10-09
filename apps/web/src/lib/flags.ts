import type { FeatureFlagKey } from '@academybee/contracts';

export type FlagsResponse = { flags: Partial<Record<string, boolean>> };

/** A flag is on only when the API explicitly says so; anything else fails closed (hidden). */
export function isFlagOn(response: FlagsResponse | null, key: FeatureFlagKey): boolean {
  return response?.flags[key] === true;
}
