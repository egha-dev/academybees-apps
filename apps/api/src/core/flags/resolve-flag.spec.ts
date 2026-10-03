import { describe, expect, it } from 'vitest';

import { type FlagOverride, resolveFlag } from './resolve-flag.js';

const KEY = 'p1-hub-placeholder';
const T1 = '0199a0a0-0000-7000-8000-000000000001';
const o = (
  environment: string | null,
  tenantId: string | null,
  enabled: boolean,
): FlagOverride => ({
  flagKey: KEY,
  environment,
  tenantId,
  enabled,
});

describe('resolveFlag', () => {
  it('falls back to the code default for the environment', () => {
    expect(resolveFlag(KEY, { appEnv: 'staging' }, [])).toBe(false);
    expect(resolveFlag(KEY, { appEnv: 'local' }, [])).toBe(true);
  });

  it('applies the most specific override', () => {
    const overrides = [
      o(null, null, false),
      o('staging', null, true),
      o(null, T1, true),
      o('staging', T1, false),
    ];
    expect(resolveFlag(KEY, { appEnv: 'local' }, overrides)).toBe(false); // global
    expect(resolveFlag(KEY, { appEnv: 'staging' }, overrides)).toBe(true); // environment
    expect(resolveFlag(KEY, { appEnv: 'local', tenantId: T1 }, overrides)).toBe(true); // tenant
    expect(resolveFlag(KEY, { appEnv: 'staging', tenantId: T1 }, overrides)).toBe(false); // env+tenant
  });

  it('ignores overrides for other environments, tenants and flags', () => {
    const overrides = [
      o('production', null, true),
      o(null, 'other', true),
      { ...o(null, null, true), flagKey: 'x' },
    ];
    expect(resolveFlag(KEY, { appEnv: 'staging', tenantId: T1 }, overrides)).toBe(false);
  });
});
