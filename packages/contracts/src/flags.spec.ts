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

  it('keeps unfinished Phase 1 screens off outside local and CI', () => {
    for (const key of ['p1-tenant-home', 'p1-hub-placeholder'] as const)
      expect(FEATURE_FLAGS[key].defaults).toEqual({
        local: true,
        ci: true,
        staging: false,
        production: false,
      });
  });

  it('lists expired flags', () => {
    expect(expiredFeatureFlags('2026-10-01')).toEqual([]);
    expect(expiredFeatureFlags('2027-02-01')).toEqual(['p1-tenant-home']);
  });

  it('recognises registered keys only', () => {
    expect(isFeatureFlagKey('p1-tenant-home')).toBe(true);
    expect(isFeatureFlagKey('p0-flag-probe')).toBe(false);
    expect(isFeatureFlagKey('constructor')).toBe(false);
  });
});
