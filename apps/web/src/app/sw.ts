/// <reference lib="esnext" />
/// <reference lib="webworker" />
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkOnly,
  type PrecacheEntry,
  Serwist,
  type SerwistGlobalConfig,
  StaleWhileRevalidate,
} from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const DAY = 24 * 60 * 60;

/**
 * AcademyBee service worker (ADR-015, ARCHITECTURE §11.7):
 * - precaches the app shell and the /offline page;
 * - caches static assets, fonts and icons only;
 * - NEVER caches /api/* (personal data lives in IndexedDB under app control, not Cache Storage);
 * - navigations go to the network and fall back to /offline;
 * - a new version waits until the user chooses "Update now" (no surprise reloads).
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST ?? [],
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    { matcher: ({ url }) => url.pathname.startsWith('/api/'), handler: new NetworkOnly() },
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/_next/static/'),
      handler: new CacheFirst({
        cacheName: 'ab-static',
        plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 30 * DAY })],
      }),
    },
    {
      matcher: ({ request }) => request.destination === 'font',
      handler: new CacheFirst({
        cacheName: 'ab-fonts',
        plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * DAY })],
      }),
    },
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/icons/'),
      handler: new StaleWhileRevalidate({ cacheName: 'ab-icons' }),
    },
    { matcher: ({ request }) => request.mode === 'navigate', handler: new NetworkOnly() },
  ],
  fallbacks: {
    entries: [{ url: '/offline', matcher: ({ request }) => request.destination === 'document' }],
  },
});

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

serwist.addEventListeners();
