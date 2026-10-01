import { expect, test } from '@playwright/test';

/** ADR-015, C-47: installable + offline fallback. Chromium only (WebKit has no SW in Playwright). */
test('the service worker registers and the app is installable', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
  await page.goto('/');
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe('/');

  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: { errorId: string }[];
  };
  expect(installabilityErrors.map((e) => e.errorId)).toEqual([]);

  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'AcademyBee', display: 'standalone', start_url: '/' });
});

test('going offline and reloading shows the AcademyBee offline page', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== 'chromium');
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await context.setOffline(false);
});

test('API responses are never stored in Cache Storage', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.evaluate(() => fetch('/api/v1/health/live').then((r) => r.text()));
  const cachedApi = await page.evaluate(async () => {
    const hits: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) {
        if (new URL(req.url).pathname.startsWith('/api/')) hits.push(req.url);
      }
    }
    return hits;
  });
  expect(cachedApi).toEqual([]);
});
