import { describe, expect, it } from 'vitest';

import {
  applyEntitlementOverrides,
  EntitlementSnapshotSchema,
  FEATURE_KEYS,
  LIMIT_KEYS,
  PLAN_CATALOGUE,
  PLAN_KEYS,
  readEntitlementSnapshot,
} from './plans.js';

describe('plan catalogue (G-25, C-89)', () => {
  it('defines every limit and feature for every plan', () => {
    for (const key of PLAN_KEYS) {
      const plan = PLAN_CATALOGUE[key];
      expect(EntitlementSnapshotSchema.parse(plan.entitlements)).toEqual(plan.entitlements);
      expect(Object.keys(plan.entitlements.limits).sort()).toEqual([...LIMIT_KEYS].sort());
      expect(Object.keys(plan.entitlements.features).sort()).toEqual([...FEATURE_KEYS].sort());
    }
  });

  it('never gates payments behind a plan (G-30)', () => {
    for (const key of [...FEATURE_KEYS, ...LIMIT_KEYS])
      expect(key).not.toMatch(/pay|fee|invoice|receipt|refund|upi|cheque|gateway/i);
  });

  it('Trial is 30 days, 100 students, everything in Growth', () => {
    expect(PLAN_CATALOGUE.trial.trialDays).toBe(30);
    expect(PLAN_CATALOGUE.trial.entitlements.limits.students).toBe(100);
    expect(PLAN_CATALOGUE.trial.entitlements.features).toEqual(
      PLAN_CATALOGUE.growth.entitlements.features,
    );
  });

  it('higher plans never have less than lower ones', () => {
    const order = [...PLAN_KEYS].filter((k) => k !== 'trial');
    for (let i = 1; i < order.length; i++) {
      const lower = PLAN_CATALOGUE[order[i - 1]!].entitlements;
      const higher = PLAN_CATALOGUE[order[i]!].entitlements;
      for (const k of LIMIT_KEYS)
        expect(higher.limits[k] ?? Infinity).toBeGreaterThanOrEqual(lower.limits[k] ?? Infinity);
      for (const f of FEATURE_KEYS) if (lower.features[f]) expect(higher.features[f]).toBe(true);
    }
  });
});

describe('entitlement snapshots', () => {
  const base = PLAN_CATALOGUE.starter.entitlements;

  it('applies overrides on top of the snapshot', () => {
    const out = applyEntitlementOverrides(base, [
      { key: 'students', kind: 'LIMIT', limit: 250 },
      { key: 'crm', kind: 'FEATURE', enabled: true },
      { key: 'staff', kind: 'LIMIT', limit: null },
    ]);
    expect(out.limits.students).toBe(250);
    expect(out.limits.staff).toBeNull();
    expect(out.features.crm).toBe(true);
    expect(base.features.crm).toBe(false);
  });

  it('reads stored snapshots defensively: unknown keys dropped, missing ones closed', () => {
    const out = readEntitlementSnapshot({
      limits: { students: 10, legacy: 5 },
      features: { crm: true, retired: true },
    });
    expect(out.limits.students).toBe(10);
    expect(out.limits.staff).toBe(0);
    expect(out.features.crm).toBe(true);
    expect(out.features.ai).toBe(false);
    expect(Object.keys(out.limits)).toEqual([...LIMIT_KEYS]);
    expect(readEntitlementSnapshot('garbage').limits.students).toBe(0);
  });
});
