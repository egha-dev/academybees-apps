import { describe, expect, it } from 'vitest';

import {
  CAPABILITIES,
  CapabilitySchema,
  isCapability,
  isPlatformCapability,
  ScopeSchema,
} from './permissions.js';

describe('capability catalogue', () => {
  it('uses resource.action names without duplicates', () => {
    expect(new Set(CAPABILITIES).size).toBe(CAPABILITIES.length);
    for (const c of CAPABILITIES) expect(c).toMatch(/^[a-z_]+(\.[a-z_]+)+$/);
  });

  it('recognises catalogue entries only', () => {
    expect(isCapability('payment.record_cash')).toBe(true);
    expect(isCapability('payment.steal')).toBe(false);
    expect(CapabilitySchema.safeParse('student.read').success).toBe(true);
    expect(CapabilitySchema.safeParse('student.delete').success).toBe(false);
  });

  it('separates platform capabilities', () => {
    expect(isPlatformCapability('platform.impersonate')).toBe(true);
    expect(isPlatformCapability('student.read')).toBe(false);
  });

  it('knows the five scopes', () => {
    expect(ScopeSchema.options).toEqual(['TENANT', 'BRANCH', 'ASSIGNED', 'LINKED', 'SELF']);
  });
});
