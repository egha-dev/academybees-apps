import { describe, expect, it } from 'vitest';

import { classifyHost, normalizeHost, tenantHost } from './host.js';

const PROD = 'academybee.com';
const STAGING = 'staging.academybee.com';
const LOCAL = 'localhost';

describe('normalizeHost', () => {
  it.each([
    ['Demo-A.AcademyBee.com', 'demo-a.academybee.com'],
    ['demo-a.localhost:3000', 'demo-a.localhost'],
    ['  demo-a.academybee.com.  ', 'demo-a.academybee.com'],
    ['academybee.com.:443', 'academybee.com'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeHost(raw)).toBe(expected);
  });

  it.each([
    [''],
    ['   '],
    ['127.0.0.1'],
    ['127.0.0.1:3000'],
    ['10.0.0.12'],
    ['[::1]:3000'],
    ['[2001:db8::1]'],
    ['demo_a.academybee.com'],
    ['demo-a..academybee.com'],
    ['.academybee.com'],
    ['-demo.academybee.com'],
    ['demo-.academybee.com'],
    ['demo-a.academybee.com:port'],
    ['demo-a.academybee.com:123456'],
    ['dëmo.academybee.com'],
    ['a'.repeat(64) + '.academybee.com'],
    [`${'a.'.repeat(130)}com`],
  ])('rejects %j', (raw) => {
    expect(normalizeHost(raw)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(normalizeHost(undefined)).toBeNull();
    expect(normalizeHost(null)).toBeNull();
  });
});

describe('classifyHost — host matrix (IMPLEMENTATION_PLAN Phase 1)', () => {
  it.each([
    // apex and www
    ['academybee.com', PROD, 'marketing', undefined],
    ['www.academybee.com', PROD, 'marketing', undefined],
    ['localhost:3000', LOCAL, 'marketing', undefined],
    ['www.localhost:3000', LOCAL, 'marketing', undefined],
    ['staging.academybee.com', STAGING, 'marketing', undefined],
    // console and Family Hub (G-31)
    ['console.academybee.com', PROD, 'console', undefined],
    ['console.localhost:3000', LOCAL, 'console', undefined],
    ['app.academybee.com', PROD, 'hub', undefined],
    ['app.localhost:3000', LOCAL, 'hub', undefined],
    ['app.staging.academybee.com', STAGING, 'hub', undefined],
    // valid tenant, uppercase, port, trailing dot
    ['gurushethra.academybee.com', PROD, 'tenant', 'gurushethra'],
    ['Sunrise-Dance.AcademyBee.com.', PROD, 'tenant', 'sunrise-dance'],
    ['demo-a.localhost:3000', LOCAL, 'tenant', 'demo-a'],
    ['demo-a.staging.academybee.com', STAGING, 'tenant', 'demo-a'],
    ['old-demo-a.localhost:3000', LOCAL, 'tenant', 'old-demo-a'],
    // unknown slugs are still tenant-shaped; resolution decides (404)
    ['nope.localhost:3000', LOCAL, 'tenant', 'nope'],
    // reserved labels stay tenant-shaped: a platform-owned tenant may hold one (C-36)
    ['demo.academybee.com', PROD, 'tenant', 'demo'],
    // custom domains (future, mocked)
    ['www.gurushethra.com', PROD, 'custom', 'www.gurushethra.com'],
    ['academy.example.co.in', PROD, 'custom', 'academy.example.co.in'],
    // a production host seen by staging is just an unknown custom domain
    ['demo-a.academybee.com', STAGING, 'custom', 'demo-a.academybee.com'],
  ] as const)('%s (root %s) → %s', (raw, root, kind, lookupKey) => {
    const result = classifyHost(raw, root);
    expect(result.kind).toBe(kind);
    if (lookupKey !== undefined) expect(result).toMatchObject({ lookupKey });
  });

  it.each([
    ['127.0.0.1:3000', LOCAL],
    ['[::1]:3000', LOCAL],
    ['xn--80ak6aa92e.academybee.com', PROD], // punycode tenant label
    ['xn--bcher-kva.example', PROD], // punycode custom domain
    ['a.b.academybee.com', PROD], // nested
    ['www.demo-a.academybee.com', PROD], // nested
    ['ab.academybee.com', PROD], // too short for a slug
    ['demo--a.academybee.com', PROD], // double hyphen
    ['intranet', PROD], // single label, not the root
    ['', PROD],
  ] as const)('%j (root %s) → invalid', (raw, root) => {
    expect(classifyHost(raw, root).kind).toBe('invalid');
  });

  it('builds tenant hosts under the root', () => {
    expect(tenantHost('demo-a', 'Localhost')).toBe('demo-a.localhost');
  });

  it('refuses an invalid root domain', () => {
    expect(() => classifyHost('x.com', '127.0.0.1')).toThrow(/root domain/);
  });
});
