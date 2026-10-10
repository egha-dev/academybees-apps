import { expect, type Page, test } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';
import { ownClientIp } from '../support/client-ip.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';
import { signInAt } from '../support/session.js';

/**
 * Students and Student 360 (UX §11.3–11.4; G-05, G-26, C-106, C-108): search, add a student with
 * a parent, a second parent, a sibling who reuses the same parent, restricted medical notes, and
 * archive with Undo. The seeded demo-a has 30 students (Aarav Sharma has a medical note).
 */
test.beforeAll(requireSeededAcademies);
test.beforeEach(({ context }) => ownClientIp(context));

const AARAV = '01a10000-0000-7000-8000-00000000a001';

/** Student 360's actions load as their own chunk: wait for it before clicking (C-99). */
async function settled(page: Page) {
  await page.waitForLoadState('networkidle');
}

/** Open a confirm dialog from an action button, retrying while a refresh re-renders the page. */
async function openDialog(page: Page, button: string) {
  await expect(async () => {
    await page.getByRole('button', { name: button }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

async function addStudent(page: Page, name: string, parent?: { name: string; phone: string }) {
  await page.getByRole('link', { name: 'Add student' }).first().click();
  await settled(page);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Add student' })).toBeVisible();
  await sheet.getByLabel('Full name').fill(name);
  if (parent) {
    await sheet.getByLabel("Parent's name").fill(parent.name);
    await sheet.getByLabel("Parent's mobile").fill(parent.phone);
  }
  return sheet;
}

test('search finds a student by part of a name, and the list opens Student 360', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await signInAt(page, testInfo, 'demo-a', 'owner@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/students'));
  await expect(page.getByRole('heading', { level: 1, name: 'Students' })).toBeVisible();
  await settled(page);
  // The browser applies the search once hydrated; the URL then carries it.
  const search = page.getByRole('searchbox', { name: 'Search students' });
  await expect(async () => {
    await search.fill('abir');
    await expect(page).toHaveURL(/[?&]q=abir/, { timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByRole('link', { name: /Kabir Khan/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Diya Iyer/ })).toHaveCount(0);
  await page.getByRole('link', { name: /Kabir Khan/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Kabir Khan' })).toBeVisible();
  await expectNoA11yViolations(page);
});

test('add a student with two parents, then a sibling who reuses the first parent', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Creates students; run once');
  const tag = `${Date.now()}`.slice(-6);
  const phone = `98${tag}11`;
  await signInAt(page, testInfo, 'demo-a', 'owner@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/students'));

  const sheet = await addStudent(page, `Meera ${tag}`, { name: `Anita ${tag}`, phone });
  await sheet.getByRole('button', { name: 'Add student' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Meera ${tag}` })).toBeVisible({
    timeout: 15_000,
  });
  await settled(page);
  const parents = page.getByRole('region', { name: 'Parents and guardians' });
  await expect(parents.getByText(`Anita ${tag}`)).toBeVisible();
  await expect(parents.getByText('Primary contact')).toBeVisible();

  // A second parent.
  await page.getByRole('button', { name: 'Add parent' }).click();
  const add = page.getByRole('dialog');
  await add.getByLabel("Parent's name").fill(`Suresh ${tag}`);
  await add.getByLabel('Relationship').selectOption('FATHER');
  await add.getByRole('button', { name: 'Add parent' }).click();
  await expect(parents.getByText(`Suresh ${tag}`)).toBeVisible();

  // A sibling: the same mobile number offers the parent already at the academy (C-106).
  await page.goto(hostUrl(testInfo, 'demo-a', '/students'));
  const second = await addStudent(page, `Kiran ${tag}`, { name: `Anita ${tag}`, phone });
  const suggestion = second.getByRole('status', { name: 'This parent may already be here' });
  await expect(suggestion).toBeVisible();
  await suggestion.getByRole('button', { name: `Use Anita ${tag}` }).click();
  await second.getByRole('button', { name: 'Add student' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Kiran ${tag}` })).toBeVisible({
    timeout: 15_000,
  });
  await settled(page);
  await parents.getByRole('button', { name: 'View' }).click();
  const view = page.getByRole('dialog');
  await expect(view.getByRole('link', { name: `Meera ${tag}` })).toBeVisible();
  await expect(view.getByRole('link', { name: `Kiran ${tag}` })).toBeVisible();
});

test('medical notes: hidden from the receptionist, shown on request to the owner (G-05)', async ({
  page,
  browser,
}, testInfo) => {
  await signInAt(page, testInfo, 'demo-a', 'owner@demo-a.test');
  test.setTimeout(90_000);
  await page.goto(hostUrl(testInfo, 'demo-a', `/students/${AARAV}`));
  await settled(page);
  const notes = page.getByRole('region', { name: 'Medical and allergy notes' });
  await expect(notes).toBeVisible();
  await expect(page.getByText('Mild peanut allergy')).toHaveCount(0);
  await notes.getByRole('button', { name: 'Show notes' }).click();
  await expect(page.getByText(/Mild peanut allergy/)).toBeVisible();

  const reception = await browser.newContext();
  await ownClientIp(reception);
  const r = await reception.newPage();
  await signInAt(r, testInfo, 'demo-a', 'reception@demo-a.test');
  await r.goto(hostUrl(testInfo, 'demo-a', `/students/${AARAV}`));
  await expect(r.getByRole('heading', { level: 1, name: 'Aarav Sharma' })).toBeVisible();
  await expect(r.getByRole('region', { name: 'Medical and allergy notes' })).toHaveCount(0);
  await expect(r.getByText(/peanut/i)).toHaveCount(0);
  await reception.close();
});

test('archive with Undo, then archive and restore (G-26)', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Changes students; run once');
  const tag = `${Date.now()}`.slice(-6);
  await signInAt(page, testInfo, 'demo-a', 'owner@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/students'));
  const sheet = await addStudent(page, `Archive ${tag}`);
  await sheet.getByRole('button', { name: 'Add student' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Archive ${tag}` })).toBeVisible({
    timeout: 15_000,
  });
  await settled(page);

  await openDialog(page, 'Archive');
  await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByText(/Archived on/)).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Undone')).toBeVisible();
  await expect(page.getByText(/Archived on/)).toHaveCount(0);
  await settled(page);

  await openDialog(page, 'Archive');
  await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByText(/Archived on/)).toBeVisible();
  await settled(page);
  await openDialog(page, 'Restore');
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText(/Archived on/)).toHaveCount(0);
  await page.getByRole('link', { name: 'Activity' }).click();
  await expect(page.getByText('Restored', { exact: true }).first()).toBeVisible();
});

test('the people pages have no WCAG 2.1 AA violations in dark mode', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ colorScheme: 'dark' });
  await ownClientIp(ctx);
  const page = await ctx.newPage();
  await signInAt(page, testInfo, 'demo-a', 'owner@demo-a.test');
  for (const path of [
    '/students',
    `/students/${AARAV}`,
    `/students/${AARAV}?tab=activity`,
    '/settings/custom-fields',
  ]) {
    await page.goto(hostUrl(testInfo, 'demo-a', path));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await settled(page);
    await expectNoA11yViolations(page);
  }
  await ctx.close();
});
