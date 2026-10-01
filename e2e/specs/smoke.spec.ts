import { expect, test } from '@playwright/test';

test('home renders the AcademyBee shell', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('AcademyBee');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'The operating system for coaching academies',
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-IN');
});

test('the API is reachable through the web origin and ready', async ({ request }) => {
  const res = await request.get('/api/v1/health/ready');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: 'ok', checks: { database: 'up', redis: 'up' } });
  expect(res.headers()['x-request-id']).toBeTruthy();
});

test('API errors reach the browser as the error envelope', async ({ request }) => {
  const res = await request.get('/api/v1/does-not-exist');
  expect(res.status()).toBe(404);
  const body = (await res.json()) as { error: { code: string; requestId: string } };
  expect(body.error.code).toBe('NOT_FOUND');
});

test('unknown pages show the AcademyBee not-found page', async ({ page }) => {
  const res = await page.goto('/does-not-exist');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to home' })).toBeVisible();
});
