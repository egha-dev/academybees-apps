import { expect, test } from '@playwright/test';

import { hostUrl, requireSeededAcademies } from '../support/hosts.js';

/**
 * Phase 1 exit gate (IMPLEMENTATION_PLAN Phase 1): each academy host shows its own identity and
 * manifest; unknown and unavailable academies get designed status pages with the right HTTP
 * status; old slugs 301; the Family Hub and console hosts are classified (G-31, ADR-003).
 */
test.beforeAll(requireSeededAcademies);

test('demo-a shows Demo A branding, title and manifest', async ({ page }, testInfo) => {
  const res = await page.goto(hostUrl(testInfo, 'demo-a'));
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to Demo A Academy');
  await expect(page.getByRole('banner').getByText('Demo A Academy')).toBeVisible();
  await expect(page).toHaveTitle(/Demo A Academy/);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  );

  const manifest = await page.goto(hostUrl(testInfo, 'demo-a', '/manifest.webmanifest'));
  expect(manifest?.headers()['content-type']).toContain('application/manifest+json');
  expect(await manifest?.json()).toMatchObject({
    name: 'Demo A Academy',
    short_name: 'Demo',
    start_url: '/',
    theme_color: '#1F6F5C',
  });
  const icon = await page.goto(hostUrl(testInfo, 'demo-a', '/academy-icon/icon-192.png'));
  expect(icon?.headers()['content-type']).toBe('image/png');
});

test('demo-b is a different academy with its own manifest', async ({ page }, testInfo) => {
  await page.goto(hostUrl(testInfo, 'demo-b'));
  await expect(page.getByRole('banner').getByText('Demo B Dance Studio')).toBeVisible();
  await expect(page.getByText('Demo A Academy')).toHaveCount(0);
  const manifest = await page.goto(hostUrl(testInfo, 'demo-b', '/manifest.webmanifest'));
  expect(await manifest?.json()).toMatchObject({ name: 'Demo B Dance Studio' });
});

const STATUS_PAGES = [
  ['nope', 404, "We couldn't find this academy"],
  ['paused', 503, 'Paused Karate Club is temporarily unavailable'],
  ['closed-demo', 410, 'This academy is no longer on AcademyBee'],
  ['setup-demo', 200, 'Setup Music School is getting ready'],
] as const;

for (const [subdomain, status, heading] of STATUS_PAGES) {
  test(`${subdomain}.localhost → ${status} "${heading}"`, async ({ page }, testInfo) => {
    const res = await page.goto(hostUrl(testInfo, subdomain, '/students'));
    expect(res?.status()).toBe(status);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    // A setting-up academy offers its owner a way in (C-85); the others link to AcademyBee.
    await expect(
      page.getByRole('link', {
        name: subdomain === 'setup-demo' ? 'I run this academy — sign in' : 'Go to AcademyBee',
      }),
    ).toBeVisible();
    // Never a raw error or internal identifier.
    await expect(page.locator('body')).not.toContainText(/tenant|uuid|prisma|exception/i);
    await page.screenshot({
      path: `artifacts/screenshots/tenant-${subdomain}-${testInfo.project.name}.png`,
      fullPage: true,
    });
  });
}

test('an old slug redirects permanently to the primary host, keeping the path', async ({
  page,
}, testInfo) => {
  const res = await page.goto(hostUrl(testInfo, 'old-demo-a', '/students?page=2'));
  expect(res?.request().redirectedFrom()?.url()).toBe(
    hostUrl(testInfo, 'old-demo-a', '/students?page=2'),
  );
  expect((await res?.request().redirectedFrom()?.response())?.status()).toBe(301);
  expect(page.url()).toBe(hostUrl(testInfo, 'demo-a', '/students?page=2'));
});

test('access denied page on an academy host', async ({ page }, testInfo) => {
  await page.goto(hostUrl(testInfo, 'demo-a', '/access-denied'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    "You don't have access to this page",
  );
  await expect(page.getByText(/ask your academy's administrator/)).toBeVisible();
});

test('internal routes cannot be typed to reach another academy', async ({ page }, testInfo) => {
  const res = await page.goto(hostUrl(testInfo, 'demo-a', '/t/demo-b'));
  expect(res?.status()).toBe(404);
  await expect(page.getByText('Demo B Dance Studio')).toHaveCount(0);
});

test('a forged x-ab-context header never changes the academy shown (review L9)', async ({
  page,
}, testInfo) => {
  const forge = (context: object) => encodeURIComponent(JSON.stringify(context));
  await page.setExtraHTTPHeaders({
    'x-ab-context': forge({ status: 'SUSPENDED', displayName: 'Demo B Dance Studio' }),
    'x-ab-apex': 'https://evil.example',
  });
  await page.goto(hostUrl(testInfo, 'demo-a'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to Demo A Academy');
  await expect(page.getByText('Demo B Dance Studio')).toHaveCount(0);

  const unknown = await page.goto(hostUrl(testInfo, 'nope'));
  expect(unknown?.status()).toBe(404);
  await expect(page.getByRole('link', { name: 'Go to AcademyBee' })).not.toHaveAttribute(
    'href',
    /evil/,
  );
});

test('app. is the Family Hub host (G-31)', async ({ page }, testInfo) => {
  await page.goto(hostUrl(testInfo, 'app'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to the Family Hub');
});

test('console. is the platform console host (C-02)', async ({ page }, testInfo) => {
  await page.goto(hostUrl(testInfo, 'console'));
  await expect(page).toHaveURL(hostUrl(testInfo, 'console', '/login'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('AcademyBee console');
});

test('the apex is the marketing site', async ({ page }, testInfo) => {
  await page.goto(hostUrl(testInfo, null));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'The operating system for coaching academies',
  );
});
