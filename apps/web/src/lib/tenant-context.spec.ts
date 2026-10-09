import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearTenantContextCache,
  decodeContextHeader,
  encodeContextHeader,
  lookupTenantContext,
} from './tenant-context';

describe('context header', () => {
  it('round-trips names in any script as an ASCII header value', () => {
    const value = encodeContextHeader({ status: 'SUSPENDED', displayName: 'ஆரவ் நடனப் பள்ளி' });
    expect(value).toMatch(/^[\x20-\x7E]+$/);
    expect(decodeContextHeader(value)).toEqual({
      status: 'SUSPENDED',
      displayName: 'ஆரவ் நடனப் பள்ளி',
    });
  });

  it('ignores missing or tampered values', () => {
    expect(decodeContextHeader(null)).toBeUndefined();
    expect(decodeContextHeader('%E0%A4%A')).toBeUndefined();
    expect(decodeContextHeader(encodeURIComponent('{"status":"ADMIN"}'))).toBeUndefined();
  });
});

describe('lookupTenantContext cache (review M3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearTenantContextCache();
  });

  it('keeps a busy academy cached while junk hosts are evicted (LRU, not clear-all)', async () => {
    const fetchMock = vi.fn((url: URL, init: RequestInit) => {
      const host = new Headers(init.headers).get('x-forwarded-host');
      return Promise.resolve(
        host === 'demo-a.localhost'
          ? Response.json({ status: 'ARCHIVED' })
          : new Response(null, { status: 404 }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const config = { apiOrigin: 'http://api', proxySecret: 's', maxEntries: 3 };
    await lookupTenantContext('demo-a.localhost', config);
    for (const junk of ['x1.localhost', 'x2.localhost', 'x3.localhost', 'x4.localhost']) {
      await lookupTenantContext(junk, config);
      await lookupTenantContext('demo-a.localhost', config);
    }
    const demoCalls = fetchMock.mock.calls.filter(
      ([, init]) => new Headers(init.headers).get('x-forwarded-host') === 'demo-a.localhost',
    );
    expect(demoCalls).toHaveLength(1);
  });

  it('re-checks a non-active academy after 10 s, an active one after 60 s (C-96)', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn((url: URL, init: RequestInit) => {
        const host = new Headers(init.headers).get('x-forwarded-host');
        return Promise.resolve(
          Response.json(
            host === 'paused.localhost'
              ? { status: 'SUSPENDED', displayName: 'Paused' }
              : {
                  status: 'ACTIVE',
                  slug: 'demo-a',
                  displayName: 'Demo A',
                  timezone: 'Asia/Kolkata',
                  locale: 'en-IN',
                  branding: {
                    primaryColor: null,
                    secondaryColor: null,
                    hasLogo: false,
                    logoUrl: null,
                    faviconUrl: null,
                  },
                },
          ),
        );
      });
      vi.stubGlobal('fetch', fetchMock);
      const config = { apiOrigin: 'http://api', proxySecret: 's' };
      const calls = (host: string) =>
        fetchMock.mock.calls.filter(
          ([, init]) => new Headers(init.headers).get('x-forwarded-host') === host,
        ).length;
      await lookupTenantContext('paused.localhost', config);
      await lookupTenantContext('demo-a.localhost', config);
      vi.advanceTimersByTime(11_000);
      await lookupTenantContext('paused.localhost', config);
      await lookupTenantContext('demo-a.localhost', config);
      expect(calls('paused.localhost')).toBe(2);
      expect(calls('demo-a.localhost')).toBe(1);
      vi.advanceTimersByTime(50_000);
      await lookupTenantContext('demo-a.localhost', config);
      expect(calls('demo-a.localhost')).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never caches a setting-up academy, so opening it shows at once (review H1)', async () => {
    let status = 'SETUP';
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        Response.json({
          status,
          slug: 'gurushethra',
          displayName: 'Gurushethra',
          timezone: 'Asia/Kolkata',
          locale: 'en-IN',
          branding: {
            primaryColor: null,
            secondaryColor: null,
            hasLogo: false,
            logoUrl: null,
            faviconUrl: null,
          },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const config = { apiOrigin: 'http://api', proxySecret: 's' };
    expect((await lookupTenantContext('gurushethra.localhost', config)).found).toBe(true);
    status = 'ACTIVE';
    const next = await lookupTenantContext('gurushethra.localhost', config);
    expect(next.found && next.context.status).toBe('ACTIVE');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports an unreachable API instead of "unknown"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );
    await expect(
      lookupTenantContext('demo-a.localhost', { apiOrigin: 'http://api', proxySecret: 's' }),
    ).rejects.toThrow(/unavailable/);
  });
});
