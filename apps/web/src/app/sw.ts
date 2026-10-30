/// <reference lib="esnext" />
/// <reference lib="webworker" />
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
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
 * - navigations go to the network and fall back to /offline, except the Teacher PWA's screens
 *   (`/teach…`, C-124): network first (3 s), then the copy cached when last opened. Those pages
 *   carry no student data (it lives in IndexedDB), and the cache is wiped on sign-out;
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
    {
      matcher: ({ request, url, sameOrigin }) =>
        request.mode === 'navigate' &&
        sameOrigin &&
        (url.pathname === '/teach' || url.pathname.startsWith('/teach/')),
      handler: new NetworkFirst({
        cacheName: 'ab-teach-shell',
        networkTimeoutSeconds: 3,
        // One cached screen serves every `?session=` (the data comes from the device).
        matchOptions: { ignoreSearch: true },
        plugins: [
          // Only the screens themselves: never a redirect (sign-in, another experience's home)
          // or an error page (review P6-4 M6).
          {
            cacheWillUpdate: ({ response }) =>
              Promise.resolve(response.ok && !response.redirected ? response : null),
          },
          new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 30 * DAY }),
        ],
      }),
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
