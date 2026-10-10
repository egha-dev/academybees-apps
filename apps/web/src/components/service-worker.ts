import { Serwist } from '@serwist/window';
import { isCurrentPageOutOfScope } from '@serwist/window/internal';

declare global {
  interface Window {
    serwist?: Serwist;
  }
}

const SW_URL = '/serwist/sw.js';
const SCOPE = '/';

/** Resolves once the page has finished loading, so registration never competes with first paint. */
function afterLoad(): Promise<void> {
  if (document.readyState === 'complete') return Promise.resolve();
  return new Promise((resolve) => window.addEventListener('load', () => resolve(), { once: true }));
}

/**
 * Registers the service worker (ADR-015, C-46) after the page has loaded (C-99) and returns it,
 * or null where service workers aren't available. Replaces `SerwistProvider`, which registered
 * from the root bundle on every route: this module only loads with the lazy PWA prompts.
 * Same behaviour as the provider we used (`reloadOnOnline: false`, scope `/`): pages reached by
 * client navigation, and the current page on reconnect, are offered to the worker's cache.
 */
export async function registerServiceWorker(): Promise<Serwist | null> {
  if (!('serviceWorker' in navigator)) return null;
  await afterLoad();
  if (window.serwist instanceof Serwist) return window.serwist;
  const serwist = new Serwist(SW_URL, { scope: SCOPE, type: 'module' });
  window.serwist = serwist;
  if (!isCurrentPageOutOfScope(SCOPE)) void serwist.register();

  const cacheUrl = (url: string | URL | null | undefined) => {
    if (!navigator.onLine || !url) return;
    void serwist.messageSW({ type: 'CACHE_URLS', payload: { urlsToCache: [String(url)] } });
  };
  const pushState = history.pushState.bind(history);
  const replaceState = history.replaceState.bind(history);
  history.pushState = (...args: Parameters<History['pushState']>) => {
    pushState(...args);
    cacheUrl(args[2]);
  };
  history.replaceState = (...args: Parameters<History['replaceState']>) => {
    replaceState(...args);
    cacheUrl(args[2]);
  };
  window.addEventListener('online', () => cacheUrl(window.location.pathname));
  return serwist;
}
