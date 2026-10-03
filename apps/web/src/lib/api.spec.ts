import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, refreshSession, SESSION_LOST_EVENT } from './api';

/** The browser globals the wrapper uses, in a node test. */
const json = (status: number, body?: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
const expired = () => json(401, { error: { code: 'SESSION_EXPIRED' } });

describe('api()', () => {
  let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
  let lost: number;

  beforeEach(() => {
    lost = 0;
    fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
    const target = new EventTarget();
    target.addEventListener(SESSION_LOST_EVENT, () => (lost += 1));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', target);
    vi.stubGlobal('document', { cookie: 'other=1; ab_csrf=csrf-token-1234567890' });
    vi.stubGlobal('navigator', { onLine: true });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends the CSRF header on writes only', async () => {
    fetchMock.mockResolvedValue(json(200, { ok: 1 }));
    await api('/x');
    await api('/x', { method: 'POST', body: {} });
    const headers = fetchMock.mock.calls.map((c) => c[1]?.headers as object);
    expect(headers[0]).not.toHaveProperty('x-csrf-token');
    expect(headers[1]).toHaveProperty('x-csrf-token', 'csrf-token-1234567890');
  });

  it('refreshes once for concurrent expired calls, then retries each', async () => {
    let refreshes = 0;
    let fresh = false;
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/v1/auth/refresh') {
        refreshes += 1;
        fresh = true;
        return Promise.resolve(json(204));
      }
      return Promise.resolve(fresh ? json(200, { url }) : expired());
    });
    const results = await Promise.all([api('/a'), api('/b'), api('/c')]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(refreshes).toBe(1);
    expect(lost).toBe(0);
  });

  it('announces a lost session when refresh fails, and returns the error', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(url === '/api/v1/auth/refresh' ? json(401) : expired()),
    );
    const res = await api('/a');
    expect(res).toMatchObject({ ok: false, error: { code: 'SESSION_EXPIRED', status: 401 } });
    expect(lost).toBe(1);
  });

  it('treats a refresh race (409) as another tab having refreshed', async () => {
    fetchMock.mockResolvedValueOnce(json(409)).mockResolvedValueOnce(json(204));
    expect(await refreshSession()).toBe(true);
  });

  it('never refreshes for anonymous calls (sign-in)', async () => {
    fetchMock.mockResolvedValue(json(401, { error: { code: 'INVALID_CREDENTIALS' } }));
    const res = await api('/auth/login', { method: 'POST', body: {}, anonymous: true });
    expect(res).toMatchObject({ ok: false, error: { code: 'INVALID_CREDENTIALS' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports Retry-After, offline and network failures as values', async () => {
    fetchMock.mockResolvedValueOnce(
      json(429, { error: { code: 'RATE_LIMITED' } }, { 'retry-after': '42' }),
    );
    expect(await api('/x')).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED', retryAfterSeconds: 42 },
    });
    fetchMock.mockRejectedValueOnce(new TypeError('failed'));
    expect(await api('/x')).toMatchObject({ ok: false, error: { code: 'NETWORK' } });
    vi.stubGlobal('navigator', { onLine: false });
    expect(await api('/x')).toMatchObject({ ok: false, error: { code: 'OFFLINE' } });
  });
});
