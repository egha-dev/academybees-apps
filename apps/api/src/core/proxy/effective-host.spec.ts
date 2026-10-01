import { describe, expect, it } from 'vitest';

import { clientIp, effectiveHost } from './effective-host.js';

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

describe('clientIp (review M4)', () => {
  const base = { hostHeader: 'x', forwardedHost: undefined };

  it('takes the left-most X-Forwarded-For entry behind the proxy secret', () => {
    expect(
      clientIp(
        {
          ...base,
          remoteAddress: '172.17.0.1',
          proxySecret: trust.secret,
          forwardedFor: '198.51.100.7, 10.0.0.5',
        },
        trust,
      ),
    ).toBe('198.51.100.7');
  });

  it('ignores X-Forwarded-For from an untrusted caller', () => {
    expect(
      clientIp(
        { ...base, remoteAddress: '203.0.113.9', proxySecret: 'wrong', forwardedFor: '1.2.3.4' },
        trust,
      ),
    ).toBe('203.0.113.9');
  });

  it('never returns a value that is not an IP (safe to log)', () => {
    expect(
      clientIp(
        {
          ...base,
          remoteAddress: '::ffff:10.0.0.5',
          proxySecret: undefined,
          forwardedFor: '<script>alert(1)</script>',
        },
        trust,
      ),
    ).toBe('10.0.0.5');
    expect(clientIp({ ...base, remoteAddress: undefined, proxySecret: undefined }, trust)).toBe(
      undefined,
    );
  });
});
