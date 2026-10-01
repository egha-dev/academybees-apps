import { describe, expect, it } from 'vitest';

import { apiForwardHeaders, stripInternalHeaders } from './forward-headers';

const forged = () =>
  new Headers({
    host: 'demo-a.localhost:3000',
    'x-forwarded-for': '1.2.3.4',
    forwarded: 'for=1.2.3.4',
    'x-real-ip': '1.2.3.4',
    'x-forwarded-host': 'demo-b.localhost',
    'x-ab-proxy-secret': 'guess',
    'x-ab-context': '%7B%22status%22%3A%22ACTIVE%22%7D',
    cookie: 'a=b',
  });

const base = { host: 'demo-a.localhost:3000', proto: 'http', secret: 'real-secret-0123456' };

describe('apiForwardHeaders (review M1)', () => {
  it('drops every client-supplied forwarding and internal header', () => {
    const h = apiForwardHeaders(forged(), base);
    expect(h.get('x-forwarded-for')).toBeNull();
    expect(h.get('forwarded')).toBeNull();
    expect(h.get('x-real-ip')).toBeNull();
    expect(h.get('x-ab-context')).toBeNull();
    expect(h.get('x-forwarded-host')).toBe('demo-a.localhost:3000');
    expect(h.get('x-ab-proxy-secret')).toBe('real-secret-0123456');
    expect(h.get('cookie')).toBe('a=b');
  });

  it('sets the client IP only from the configured platform header', () => {
    const incoming = forged();
    incoming.set('x-vercel-real', '198.51.100.7');
    expect(
      apiForwardHeaders(incoming, { ...base, clientIpHeader: 'x-vercel-real' }).get(
        'x-forwarded-for',
      ),
    ).toBe('198.51.100.7');
  });

  it('never forwards the client value even when the platform header is the same one it forged', () => {
    // On Vercel `x-real-ip` is overwritten by the platform; here it is the forged value and must
    // still be validated as an IP before use.
    const incoming = forged();
    incoming.set('x-real-ip', '<script>');
    expect(
      apiForwardHeaders(incoming, { ...base, clientIpHeader: 'x-real-ip' }).get('x-forwarded-for'),
    ).toBeNull();
  });
});

describe('stripInternalHeaders', () => {
  it('removes x-ab-* only', () => {
    const h = stripInternalHeaders(forged());
    expect(h.get('x-ab-context')).toBeNull();
    expect(h.get('x-ab-proxy-secret')).toBeNull();
    expect(h.get('cookie')).toBe('a=b');
  });
});
