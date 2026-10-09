import { z } from 'zod';

/**
 * Release flags (ADR-041): rollout switches for unfinished user-visible work and kill switches.
 * Not plan entitlements (ADR-028). Every flag has an owner and an expiry date; CI lists expired
 * flags so they are removed within one phase of full rollout.
 */
export const APP_ENVS = ['local', 'ci', 'staging', 'production'] as const;
export const AppEnvSchema = z.enum(APP_ENVS);
export type AppEnv = z.infer<typeof AppEnvSchema>;

export type FeatureFlagDefinition = {
  description: string;
  owner: string;
  /** ISO date (YYYY-MM-DD) by which the flag must be removed. */
  expiresOn: string;
  /** Default per environment when no override exists. */
  defaults: Record<AppEnv, boolean>;
};

export const FEATURE_FLAGS = {
  'p2-role-homes': {
    description:
      'Signed-in landing pages at /today (Manage) and /teach (Teacher) until their real homes ship (Phase 5/6) — remove then.',
    owner: 'PO',
    expiresOn: '2027-03-31',
    defaults: { local: true, ci: true, staging: true, production: false },
  },
  'p1-hub-placeholder': {
    description:
      'Family Hub placeholder on app. (G-31) until Parent Core ships in Phase 7P — remove then. Off: app. redirects to the marketing site.',
    owner: 'PO',
    expiresOn: '2027-06-30',
    defaults: { local: true, ci: true, staging: false, production: false },
  },
  'p3-onboarding': {
    description:
      'Guided setup for academies that are setting up (C-85): sign-in, legal, welcome and onboarding pages on SETUP hosts. On when the onboarding screens are complete (Phase 3 S7/S8) — remove then.',
    owner: 'PO',
    expiresOn: '2027-01-31',
    defaults: { local: false, ci: false, staging: false, production: false },
  },
} as const satisfies Record<string, FeatureFlagDefinition>;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export function isFeatureFlagKey(key: string): key is FeatureFlagKey {
  return Object.hasOwn(FEATURE_FLAGS, key);
}

/** Flags whose expiry date is before `today` (YYYY-MM-DD). */
export function expiredFeatureFlags(today: string): FeatureFlagKey[] {
  return (Object.keys(FEATURE_FLAGS) as FeatureFlagKey[]).filter(
    (key) => FEATURE_FLAGS[key].expiresOn < today,
  );
}
