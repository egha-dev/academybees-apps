import { expect, type Page } from '@playwright/test';

/**
 * Wait until the service worker controls the page and the teacher screens are cached. One online
 * reload under its control puts every script this screen needs (the lazy teacher app included)
 * through the worker's cache, as a second visit would on a real phone.
 */
export async function readyForOffline(page: Page, ready: () => Promise<void>) {
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
      timeout: 30_000,
    })
    .toBe(true);
  await page.reload();
  await ready();
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const cache = await caches.open('ab-teach-shell');
          return Boolean(await cache.match('/teach/attendance', { ignoreSearch: true }));
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
}

/** The attendance screen's running count. */
export const counts = (present: number, absent: number, unmarked = 0, late = 0) =>
  `${present} present · ${absent} absent · ${late} late · 0 leave · ${unmarked} not marked`;
