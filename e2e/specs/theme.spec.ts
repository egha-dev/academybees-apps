import { expect, type Page, test } from '@playwright/test';

/** Light / dark themes (C-49): follow the device, remember the choice, never flash. */
const DARK_BG = 'rgb(25, 24, 22)'; // #191816
const LIGHT_BG = 'rgb(250, 250, 247)'; // #FAFAF7

const bodyBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('follows the device setting when the user has not chosen', async ({ browser }) => {
  for (const [colorScheme, bg] of [
    ['dark', DARK_BG],
    ['light', LIGHT_BG],
  ] as const) {
    const context = await browser.newContext({ colorScheme });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-ab-theme', colorScheme);
    expect(await bodyBackground(page)).toBe(bg);
    await context.close();
  }
});

test('no flash: the stored theme applies before any app JavaScript runs', async ({ browser }) => {
  // A light-mode device whose user chose Dark; every app script is blocked, so only the inline
  // theme script in the server HTML can set the theme.
  const context = await browser.newContext({ colorScheme: 'light' });
  await context.addInitScript(() => localStorage.setItem('ab-theme-mode', 'dark'));
  await context.route('**/_next/static/**/*.js', (route) => route.abort());
  const page = await context.newPage();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-ab-theme', 'dark');
  expect(await bodyBackground(page)).toBe(DARK_BG);
  await context.close();
});

test('the Light / Dark / System toggle switches the theme and is remembered', async ({
  browser,
}) => {
  const context = await browser.newContext({ colorScheme: 'light' });
  const page = await context.newPage();
  await page.goto('/');
  const toggle = page.getByRole('radiogroup', { name: 'Theme' });
  await expect(toggle.getByRole('radio', { name: 'System' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  await toggle.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-ab-theme', 'dark');
  expect(await bodyBackground(page)).toBe(DARK_BG);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ab-theme', 'dark');
  await expect(
    page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Dark' }),
  ).toHaveAttribute('aria-checked', 'true');

  await page
    .getByRole('radiogroup', { name: 'Theme' })
    .getByRole('radio', { name: 'System' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-ab-theme', 'light');
  await context.close();
});
