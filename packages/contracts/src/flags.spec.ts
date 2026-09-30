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

  it('keeps the probe flag off by default everywhere', () => {
    expect(Object.values(FEATURE_FLAGS['p0-flag-probe'].defaults)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it('lists expired flags', () => {
    expect(expiredFeatureFlags('2026-10-01')).toEqual([]);
    expect(expiredFeatureFlags('2027-01-01')).toEqual(['p0-flag-probe']);
  });

  it('recognises registered keys only', () => {
    expect(isFeatureFlagKey('p0-flag-probe')).toBe(true);
    expect(isFeatureFlagKey('constructor')).toBe(false);
  });
});
