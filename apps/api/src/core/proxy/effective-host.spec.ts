import { describe, expect, it } from 'vitest';

import { effectiveHost } from './effective-host.js';

const trust = { trustedIps: ['10.0.0.5'], secret: 'proxy-secret-0123456789' };

describe('effectiveHost', () => {
  it('ignores X-Forwarded-Host from an untrusted caller (tenant spoofing)', () => {
    expect(
      effectiveHost(
        {
          remoteAddress: '203.0.113.9',
          hostHeader: 'api.internal:4000',
          forwardedHost: 'victim-academy.academybee.com',
          proxySecret: undefined,
        },
        trust,
      ),
    ).toBe('api.internal:4000');
  });

  it('honours X-Forwarded-Host from a trusted proxy IP', () => {
    expect(
      effectiveHost(
        {
          remoteAddress: '10.0.0.5',
          hostHeader: 'api',
          forwardedHost: 'Demo-A.Localhost:3000',
          proxySecret: undefined,
        },
        trust,
      ),
    ).toBe('demo-a.localhost:3000');
  });

  it('honours X-Forwarded-Host with the shared secret, rejects a wrong secret', () => {
    const base = {
      remoteAddress: '198.51.100.1',
      hostHeader: 'api',
      forwardedHost: 'a.academybee.com',
    };
    expect(effectiveHost({ ...base, proxySecret: 'proxy-secret-0123456789' }, trust)).toBe(
      'a.academybee.com',
    );
    expect(effectiveHost({ ...base, proxySecret: 'proxy-secret-wrong' }, trust)).toBe('api');
  });

  it('takes the first value of a list', () => {
    expect(
      effectiveHost(
        {
          remoteAddress: '10.0.0.5',
          hostHeader: 'api',
          forwardedHost: 'a.academybee.com, evil.com',
          proxySecret: undefined,
        },
        trust,
      ),
    ).toBe('a.academybee.com');
  });
});
