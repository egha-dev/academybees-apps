import { z } from 'zod';

/**
 * Plans and entitlements (C-03, C-89, ADR-028, G-25). The catalogue below is the source of truth:
 * it is synced into `plan` / `plan_entitlement` on every migrate/deploy. Numbers are the G-25
 * pricing hypothesis (OD-12); prices arrive with billing (Phase 13).
 *
 * Payments are never an entitlement (G-30): every plan, Trial included, has every payment feature.
 */
export const LIMIT_KEYS = [
  'students',
  'staff',
  'branches',
  'storageMb',
  'messagesPerMonth',
] as const;
export const LimitKeySchema = z.enum(LIMIT_KEYS);
export type LimitKey = z.infer<typeof LimitKeySchema>;

export const FEATURE_KEYS = [
  'crm',
  'learning',
  'whatsapp',
  'reports_advanced',
  'custom_domain',
  'own_whatsapp_number',
  'ai',
] as const;
export const FeatureKeySchema = z.enum(FEATURE_KEYS);
export type FeatureKey = z.infer<typeof FeatureKeySchema>;

export const PLAN_KEYS = ['trial', 'starter', 'growth', 'pro'] as const;
export const PlanKeySchema = z.enum(PLAN_KEYS);
export type PlanKey = z.infer<typeof PlanKeySchema>;

/** What an academy may do: a limit (null = unlimited) per key and on/off per feature. */
export const EntitlementSnapshotSchema = z.object({
  limits: z.record(LimitKeySchema, z.number().int().nonnegative().nullable()),
  features: z.record(FeatureKeySchema, z.boolean()),
});
export type EntitlementSnapshot = z.infer<typeof EntitlementSnapshotSchema>;

export type PlanDefinition = {
  name: string;
  sortOrder: number;
  /** Trial length when an academy starts on this plan; null = not a trial plan. */
  trialDays: number | null;
  entitlements: EntitlementSnapshot;
};

const NO_FEATURES: Record<FeatureKey, boolean> = {
  crm: false,
  learning: false,
  whatsapp: false,
  reports_advanced: false,
  custom_domain: false,
  own_whatsapp_number: false,
  ai: false,
};
const GROWTH_FEATURES: Record<FeatureKey, boolean> = {
  ...NO_FEATURES,
  crm: true,
  learning: true,
  whatsapp: true,
};

export const PLAN_CATALOGUE = {
  // G-25: free for 30 days, 100 students, everything in Growth.
  trial: {
    name: 'Trial',
    sortOrder: 0,
    trialDays: 30,
    entitlements: {
      limits: { students: 100, staff: 15, branches: 1, storageMb: 2048, messagesPerMonth: 1000 },
      features: GROWTH_FEATURES,
    },
  },
  starter: {
    name: 'Starter',
    sortOrder: 1,
    trialDays: null,
    entitlements: {
      limits: { students: 100, staff: 5, branches: 1, storageMb: 1024, messagesPerMonth: 500 },
      features: NO_FEATURES,
    },
  },
  growth: {
    name: 'Growth',
    sortOrder: 2,
    trialDays: null,
    entitlements: {
      limits: { students: 300, staff: 15, branches: 2, storageMb: 5120, messagesPerMonth: 3000 },
      features: GROWTH_FEATURES,
    },
  },
  pro: {
    name: 'Pro',
    sortOrder: 3,
    trialDays: null,
    entitlements: {
      limits: { students: 1000, staff: 40, branches: 5, storageMb: 20480, messagesPerMonth: 10000 },
      features: {
        ...GROWTH_FEATURES,
        reports_advanced: true,
        custom_domain: true,
        own_whatsapp_number: true,
      },
    },
  },
} as const satisfies Record<PlanKey, PlanDefinition>;

/** The plan an academy starts on when the console doesn't pick one (C-89). */
export const DEFAULT_PLAN_KEY: PlanKey = 'trial';

/** A per-academy exception granted by platform staff (Phase 14 UI). */
export type EntitlementOverride =
  | { key: LimitKey; kind: 'LIMIT'; limit: number | null }
  | { key: FeatureKey; kind: 'FEATURE'; enabled: boolean };

/** The snapshot an academy actually has: its subscription snapshot with overrides applied. */
export function applyEntitlementOverrides(
  snapshot: EntitlementSnapshot,
  overrides: readonly EntitlementOverride[],
): EntitlementSnapshot {
  const limits = { ...snapshot.limits };
  const features = { ...snapshot.features };
  for (const o of overrides) {
    if (o.kind === 'LIMIT') limits[o.key] = o.limit;
    else features[o.key] = o.enabled;
  }
  return { limits, features };
}

/**
 * Read a stored snapshot defensively: keys added to the catalogue after the snapshot was taken
 * default to "off" / 0 rather than throwing, so an old academy never gains a feature by accident.
 */
export function readEntitlementSnapshot(raw: unknown): EntitlementSnapshot {
  const parsed = z
    .object({
      limits: z.record(z.string(), z.number().int().nonnegative().nullable()).default({}),
      features: z.record(z.string(), z.boolean()).default({}),
    })
    .catch({ limits: {}, features: {} })
    .parse(raw);
  const limits = Object.fromEntries(
    LIMIT_KEYS.map((k) => [k, k in parsed.limits ? (parsed.limits[k] ?? null) : 0]),
  ) as Record<LimitKey, number | null>;
  const features = Object.fromEntries(
    FEATURE_KEYS.map((k) => [k, parsed.features[k] === true]),
  ) as Record<FeatureKey, boolean>;
  return { limits, features };
}

/**
 * Error details (`{ path, issue }`, ErrorDetailSchema): `403 ENTITLEMENT_LIMIT_REACHED` carries
 * `{ path: <limit key>, issue: 'limit_reached' }`, `403 FEATURE_NOT_IN_PLAN` carries
 * `{ path: <feature key>, issue: 'not_in_plan' }`, so the UI can name what ran out.
 */
export const ENTITLEMENT_ISSUES = { limit: 'limit_reached', feature: 'not_in_plan' } as const;

/** Length of the trial every new academy gets, whichever plan it starts on (G-25, C-89). */
export const TRIAL_DAYS = 30;

/**
 * The subscription a new academy starts with: TRIAL on the chosen plan with that plan's
 * entitlements snapshotted (C-89). Trials don't expire while billing is off (C-03).
 */
export function startTrialSubscription(planKey: PlanKey, now: Date) {
  const plan = PLAN_CATALOGUE[planKey];
  return {
    planKey,
    status: 'TRIAL' as const,
    trialEndsAt: new Date(now.getTime() + (plan.trialDays ?? TRIAL_DAYS) * 86_400_000),
    entitlements: plan.entitlements as EntitlementSnapshot,
  };
}
