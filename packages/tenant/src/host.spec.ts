import { describe, expect, it } from 'vitest';

import { classifyHost, normalizeHost, tenantHost } from './host.js';

const PROD = 'academybees.com';
const STAGING = 'staging.academybees.com';
const LOCAL = 'localhost';

describe('normalizeHost', () => {
  it.each([
    ['Demo-A.AcademyBees.com', 'demo-a.academybees.com'],
    ['demo-a.localhost:3000', 'demo-a.localhost'],
    ['  demo-a.academybees.com.  ', 'demo-a.academybees.com'],
    ['academybees.com.:443', 'academybees.com'],
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
    ['demo_a.academybees.com'],
    ['demo-a..academybees.com'],
    ['.academybees.com'],
    ['-demo.academybees.com'],
    ['demo-.academybees.com'],
    ['demo-a.academybees.com:port'],
    ['demo-a.academybees.com:123456'],
    ['dëmo.academybees.com'],
    ['a'.repeat(64) + '.academybees.com'],
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
    ['academybees.com', PROD, 'marketing', undefined],
    ['www.academybees.com', PROD, 'marketing', undefined],
    ['localhost:3000', LOCAL, 'marketing', undefined],
    ['www.localhost:3000', LOCAL, 'marketing', undefined],
    ['staging.academybees.com', STAGING, 'marketing', undefined],
    // console and Family Hub (G-31)
    ['console.academybees.com', PROD, 'console', undefined],
    ['console.localhost:3000', LOCAL, 'console', undefined],
    ['app.academybees.com', PROD, 'hub', undefined],
    ['app.localhost:3000', LOCAL, 'hub', undefined],
    ['app.staging.academybees.com', STAGING, 'hub', undefined],
    // valid tenant, uppercase, port, trailing dot
    ['gurushethra.academybees.com', PROD, 'tenant', 'gurushethra'],
    ['Sunrise-Dance.AcademyBees.com.', PROD, 'tenant', 'sunrise-dance'],
    ['demo-a.localhost:3000', LOCAL, 'tenant', 'demo-a'],
    ['demo-a.staging.academybees.com', STAGING, 'tenant', 'demo-a'],
    ['old-demo-a.localhost:3000', LOCAL, 'tenant', 'old-demo-a'],
    // unknown slugs are still tenant-shaped; resolution decides (404)
    ['nope.localhost:3000', LOCAL, 'tenant', 'nope'],
    // reserved labels stay tenant-shaped: a platform-owned tenant may hold one (C-36)
    ['demo.academybees.com', PROD, 'tenant', 'demo'],
    // custom domains (future, mocked)
    ['www.gurushethra.com', PROD, 'custom', 'www.gurushethra.com'],
    ['academy.example.co.in', PROD, 'custom', 'academy.example.co.in'],
    // a production host seen by staging is just an unknown custom domain
    ['demo-a.academybees.com', STAGING, 'custom', 'demo-a.academybees.com'],
  ] as const)('%s (root %s) → %s', (raw, root, kind, lookupKey) => {
    const result = classifyHost(raw, root);
    expect(result.kind).toBe(kind);
    if (lookupKey !== undefined) expect(result).toMatchObject({ lookupKey });
  });

  it.each([
    ['127.0.0.1:3000', LOCAL],
    ['[::1]:3000', LOCAL],
    ['xn--80ak6aa92e.academybees.com', PROD], // punycode tenant label
    ['xn--bcher-kva.example', PROD], // punycode custom domain
    ['a.b.academybees.com', PROD], // nested
    ['www.demo-a.academybees.com', PROD], // nested
    ['ab.academybees.com', PROD], // too short for a slug
    ['demo--a.academybees.com', PROD], // double hyphen
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
