import { describe, expect, it } from 'vitest';

import { expiredFeatureFlags, FEATURE_FLAGS, isFeatureFlagKey } from './flags.js';

describe('feature flag registry', () => {
  it('gives every flag an owner, an ISO expiry and a default per environment', () => {
    for (const def of Object.values(FEATURE_FLAGS)) {
      expect(def.owner).not.toBe('');
      expect(def.expiresOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Object.keys(def.defaults).sort()).toEqual(['ci', 'local', 'production', 'staging']);
    }
  });

  it('keeps unfinished screens off in production', () => {
    for (const def of Object.values(FEATURE_FLAGS)) expect(def.defaults.production).toBe(false);
    expect(FEATURE_FLAGS['p1-hub-placeholder'].defaults.staging).toBe(false);
  });

  it('lists expired flags', () => {
    expect(expiredFeatureFlags('2026-10-01')).toEqual([]);
    expect(expiredFeatureFlags('2027-02-01')).toEqual(['p2-console-home']);
    expect(expiredFeatureFlags('2027-04-01')).toEqual(['p2-role-homes', 'p2-console-home']);
  });

  it('recognises registered keys only', () => {
    expect(isFeatureFlagKey('p2-role-homes')).toBe(true);
    expect(isFeatureFlagKey('p1-tenant-home')).toBe(false);
    expect(isFeatureFlagKey('p0-flag-probe')).toBe(false);
    expect(isFeatureFlagKey('constructor')).toBe(false);
  });
});
