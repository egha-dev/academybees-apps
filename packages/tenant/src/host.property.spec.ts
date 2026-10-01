import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { classifyHost, normalizeHost } from './host.js';
import { RESERVED_SLUGS } from './reserved.js';
import { validateSlug } from './slug.js';

const ROOTS = ['academybee.com', 'staging.academybee.com', 'localhost'];
const root = fc.constantFrom(...ROOTS);

const slugChar = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''));
/** Slugs per ARCHITECTURE §4.1 (no reserved names, no `--`). */
const validSlug = fc
  .tuple(
    slugChar,
    fc.array(fc.oneof(slugChar, fc.constant('-')), { minLength: 1, maxLength: 40 }),
    slugChar,
  )
  .map(([first, middle, last]) => `${first}${middle.join('')}${last}`)
  .filter((slug) => validateSlug(slug).ok);

const hostNoise = fc.oneof(
  fc.string(),
  fc.string({ unit: 'grapheme' }),
  fc.domain(),
  fc.ipV4(),
  fc.ipV6().map((ip) => `[${ip}]`),
  fc.webUrl(),
);

describe('host rules — properties', () => {
  it('normalizeHost is idempotent', () => {
    fc.assert(
      fc.property(hostNoise, (raw) => {
        const once = normalizeHost(raw);
        if (once !== null) expect(normalizeHost(once)).toBe(once);
      }),
    );
  });

  it('never throws on arbitrary input', () => {
    fc.assert(
      fc.property(hostNoise, root, (raw, r) => {
        expect(() => classifyHost(raw, r)).not.toThrow();
      }),
    );
  });

  it('a valid slug under any root round-trips as a tenant, regardless of case, port or trailing dot', () => {
    fc.assert(
      fc.property(
        validSlug,
        root,
        fc.boolean(),
        fc.option(fc.integer({ min: 1, max: 65535 })),
        fc.boolean(),
        (slug, r, upper, port, dot) => {
          let host = `${slug}.${r}${dot ? '.' : ''}`;
          if (upper) host = host.toUpperCase();
          if (port !== null) host = `${host}:${port}`;
          expect(classifyHost(host, r)).toMatchObject({ kind: 'tenant', lookupKey: slug });
        },
      ),
    );
  });

  it('IP literals are never anything but invalid', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.ipV4(),
          fc.ipV6().map((ip) => `[${ip}]`),
        ),
        root,
        (ip, r) => {
          expect(classifyHost(ip, r).kind).toBe('invalid');
        },
      ),
    );
  });

  it('punycode is never classified as a tenant or custom domain', () => {
    fc.assert(
      fc.property(fc.domain(), root, (domain, r) => {
        const host = `xn--${domain.replace(/^xn--/, '')}`;
        const kind = classifyHost(host, r).kind;
        expect(['tenant', 'custom']).not.toContain(kind);
      }),
    );
  });

  it('only tenant-shaped hosts produce a tenant lookup key, and it never contains a dot', () => {
    fc.assert(
      fc.property(hostNoise, root, (raw, r) => {
        const result = classifyHost(raw, r);
        if (result.kind === 'tenant') {
          expect(result.lookupKey).not.toContain('.');
          expect(result.lookupKey).not.toContain('--');
        }
        if (result.kind === 'custom') expect(result.lookupKey).toContain('.');
      }),
    );
  });

  it('reserved names are never provisionable', () => {
    fc.assert(
      fc.property(fc.constantFrom(...RESERVED_SLUGS), fc.boolean(), (slug, upper) => {
        expect(validateSlug(upper ? slug.toUpperCase() : slug).ok).toBe(false);
      }),
    );
  });
});
