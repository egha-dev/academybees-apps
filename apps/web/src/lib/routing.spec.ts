import { classifyHost } from '@academybee/tenant';
import { describe, expect, it } from 'vitest';

import { decideRoute } from './routing';
import type { ContextLookup } from './tenant-context';

const ROOT = 'localhost';
const active: ContextLookup = {
  found: true,
  context: {
    status: 'ACTIVE',
    slug: 'demo-a',
    displayName: 'Demo A Academy',
    timezone: 'Asia/Kolkata',
    locale: 'en-IN',
    branding: {
      primaryColor: '#1F6F5C',
      secondaryColor: null,
      hasLogo: false,
      logoUrl: null,
      faviconUrl: null,
    },
  },
};

function route(host: string, path = '/', lookup?: ContextLookup | 'unavailable', search = '') {
  return decideRoute({
    hostClass: classifyHost(host, ROOT),
    pathname: path,
    search,
    port: '3000',
    protocol: 'http:',
    lookup,
  });
}

describe('decideRoute (ARCHITECTURE §10.2)', () => {
  it('serves marketing on the apex and www', () => {
    expect(route('localhost:3000')).toEqual({ type: 'next' });
    expect(route('www.localhost:3000', '/pricing')).toEqual({ type: 'next' });
  });

  it('rewrites console and the Family Hub (G-31) to their route groups', () => {
    expect(route('console.localhost:3000', '/academies')).toEqual({
      type: 'rewrite',
      path: '/console/academies',
    });
    expect(route('app.localhost:3000')).toEqual({ type: 'rewrite', path: '/hub' });
  });

  it('rewrites an ACTIVE academy to /t/<slug>, keeping the visible path', () => {
    expect(route('demo-a.localhost:3000', '/', active)).toEqual({
      type: 'rewrite',
      path: '/t/demo-a',
    });
    expect(route('demo-a.localhost:3000', '/students', active)).toEqual({
      type: 'rewrite',
      path: '/t/demo-a/students',
    });
  });

  it('301s an old slug to the primary host with the same path, query and port', () => {
    expect(
      route(
        'old-demo-a.localhost:3000',
        '/students',
        {
          found: true,
          context: { status: 'REDIRECT', host: 'demo-a.localhost' },
        },
        '?page=2',
      ),
    ).toEqual({
      type: 'redirect',
      status: 301,
      location: 'http://demo-a.localhost:3000/students?page=2',
    });
  });

  it.each([
    ['unknown academy', { found: false }, '/status/unknown', 404],
    [
      'suspended',
      { found: true, context: { status: 'SUSPENDED', displayName: 'P' } },
      '/status/suspended',
      503,
    ],
    ['archived', { found: true, context: { status: 'ARCHIVED' } }, '/status/archived', 410],
    ['API unreachable', 'unavailable', '/status/unavailable', 503],
  ] as const)('%s → status page', (_, lookup, path, status) => {
    expect(route('x-academy.localhost:3000', '/anything', lookup as ContextLookup)).toEqual({
      type: 'rewrite',
      path,
      status,
    });
  });

  it('setting-up academies serve sign-in and the guided setup; the rest goes to the gate', () => {
    const setup: ContextLookup = {
      found: true,
      context: {
        status: 'SETUP',
        slug: 'setup-demo',
        displayName: 'Setup Music School',
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
    };

    // Sign-in, legal and the guided setup open; everything else goes to the setup gate (C-85).
    const setupRoute = (path: string) =>
      decideRoute({
        hostClass: classifyHost('setup-demo.localhost:3000', ROOT),
        pathname: path,
        search: '',
        port: '3000',
        protocol: 'http:',
        lookup: setup,
      });
    for (const path of [
      '/login',
      '/invite',
      '/reset-password',
      '/legal',
      '/welcome',
      '/onboarding/course',
    ])
      expect(setupRoute(path)).toEqual({ type: 'rewrite', path: `/t/setup-demo${path}` });
    for (const path of ['/', '/today', '/settings/team', '/teach', '/onboardingx'])
      expect(setupRoute(path)).toEqual({ type: 'rewrite', path: '/t/setup-demo/setup-gate' });
    // The gate itself can't be typed on any host.
    expect(setupRoute('/setup-gate')).toEqual({ type: 'rewrite', path: '/__not-found' });
  });

  it('IPs, punycode and nested hosts are unknown academies', () => {
    for (const host of ['127.0.0.1:3000', 'xn--80ak6aa92e.localhost', 'a.b.localhost'])
      expect(route(host)).toMatchObject({ path: '/status/unknown', status: 404 });
  });

  it('never lets a visitor type an internal route', () => {
    for (const path of ['/t/demo-b', '/t/demo-b/students', '/console', '/hub', '/status/setup'])
      expect(route('demo-a.localhost:3000', path, active)).toEqual({
        type: 'rewrite',
        path: '/__not-found',
      });
  });

  it('serves shared app pages on every host', () => {
    expect(route('demo-a.localhost:3000', '/offline', active)).toEqual({ type: 'next' });
  });

  it('serves the academy manifest and icons only for ACTIVE academies', () => {
    expect(route('demo-a.localhost:3000', '/manifest.webmanifest', active)).toEqual({
      type: 'rewrite',
      path: '/t/demo-a/manifest.webmanifest',
    });
    expect(route('demo-a.localhost:3000', '/academy-icon/icon-192.png', active)).toEqual({
      type: 'rewrite',
      path: '/t/demo-a/academy-icon/icon-192.png',
    });
    expect(
      route('paused.localhost:3000', '/manifest.webmanifest', {
        found: true,
        context: { status: 'SUSPENDED', displayName: 'P' },
      }),
    ).toEqual({ type: 'next' });
    expect(route('localhost:3000', '/manifest.webmanifest')).toEqual({ type: 'next' });
    expect(route('console.localhost:3000', '/manifest.webmanifest')).toEqual({ type: 'next' });
  });

  it('matches internal and shared prefixes by whole segment only (review L3)', () => {
    for (const path of [
      '/hubs',
      '/hub-settings',
      '/console-help',
      '/tea',
      '/offline-x',
      '/status-report',
    ])
      expect(route('demo-a.localhost:3000', path, active)).toEqual({
        type: 'rewrite',
        path: `/t/demo-a${path}`,
      });
    for (const path of ['/t', '/hub', '/hub/x', '/status'])
      expect(route('demo-a.localhost:3000', path, active)).toEqual({
        type: 'rewrite',
        path: '/__not-found',
      });
  });
});
