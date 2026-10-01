import { describe, expect, it } from 'vitest';

import { TenantContextResponseSchema } from './tenant.js';

describe('TenantContextResponseSchema', () => {
  it('strips anything beyond the public fields for each status', () => {
    const archived = TenantContextResponseSchema.parse({
      status: 'ARCHIVED',
      displayName: 'Hidden',
      tenantId: '01a0f76f-f6b7-7509-a8c2-25059adb97fb',
    });
    expect(archived).toEqual({ status: 'ARCHIVED' });
    const suspended = TenantContextResponseSchema.parse({
      status: 'SUSPENDED',
      displayName: 'Paused',
      branding: { primaryColor: '#000000' },
    });
    expect(suspended).toEqual({ status: 'SUSPENDED', displayName: 'Paused' });
  });

  it('rejects a colour that is not #RRGGBB', () => {
    expect(() =>
      TenantContextResponseSchema.parse({
        status: 'ACTIVE',
        slug: 'a',
        displayName: 'A',
        timezone: 'Asia/Kolkata',
        locale: 'en-IN',
        branding: { primaryColor: 'red', secondaryColor: null, hasLogo: false },
      }),
    ).toThrow();
  });
});
