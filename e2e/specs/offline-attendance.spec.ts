import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  type BrowserContext,
  chromium,
  expect,
  type Page,
  test,
  type TestInfo,
} from '@playwright/test';

import {
  adminCall,
  adminSession,
  classForDemoTeacher,
  rollCall,
  tooLateToday,
} from '../support/classes.js';
import { ownClientIp } from '../support/client-ip.js';
import { inAcademy } from '../support/db.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';
import { signInAt } from '../support/session.js';

/**
 * Offline attendance (Phase 6 S5; ADR-016, C-124, C-126; IMPLEMENTATION_PLAN Phase 6 tests): a
 * teacher marks 25 students with no connection, reloads, closes and reopens the app — still
 * offline — and when the connection returns everything syncs exactly once, even when a push's
 * answer is lost on the way back. Chromium only: Playwright runs service workers there (WebKit
 * offline is proven on a real iPhone, C-131).
 */
test.beforeAll(requireSeededAcademies);

/** A real browser profile on disk, so closing and reopening keeps the service worker, its
 * caches, IndexedDB and cookies — like an installed app being restarted. */
async function launchDevice(dir: string, testInfo: TestInfo): Promise<BrowserContext> {
  const u = testInfo.project.use;
  const context = await chromium.launchPersistentContext(dir, {
    ...(u.viewport ? { viewport: u.viewport } : {}),
    ...(u.userAgent ? { userAgent: u.userAgent } : {}),
    ...(u.deviceScaleFactor ? { deviceScaleFactor: u.deviceScaleFactor } : {}),
    ...(u.isMobile !== undefined ? { isMobile: u.isMobile } : {}),
    ...(u.hasTouch !== undefined ? { hasTouch: u.hasTouch } : {}),
  });
  await ownClientIp(context);
  return context;
}

/**
 * Wait until the service worker controls the page and the teacher screens are cached. One online
 * reload under its control puts every script this screen needs (the lazy teacher app included)
 * through the worker's cache, as a second visit would on a real phone.
 */
async function readyForOffline(page: Page, ready: () => Promise<void>) {
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

const counts = (present: number, absent: number, unmarked = 0) =>
  `${present} present · ${absent} absent · 0 late · 0 leave · ${unmarked} not marked`;

test('25 marks offline survive a reload and a restart, then sync exactly once', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === 'iphone-webkit', 'Service workers: Chromium only');
  test.skip(tooLateToday(), 'Too close to midnight in India for a class today');
  test.setTimeout(300_000);
  const tag = `${testInfo.project.name.split('-')[0]} ${Date.now().toString(36)}`;
  const admin = await adminSession(browser, testInfo);
  const { sessionId, students } = await classForDemoTeacher(admin, `Mohiniyattam ${tag}`, 25);
  const attendanceUrl = hostUrl(testInfo, 'demo-a', `/teach/attendance?session=${sessionId}`);
  const dir = await mkdtemp(join(tmpdir(), 'ab-device-'));
  try {
    // Online once: sign in, the first download, the screens cached.
    let device = await launchDevice(dir, testInfo);
    let page = device.pages()[0] ?? (await device.newPage());
    await signInAt(page, testInfo, 'demo-a', 'teacher@demo-a.test');
    await page.goto(attendanceUrl);
    const blank = () => expect(page.getByText(counts(0, 0, 25))).toBeVisible({ timeout: 30_000 });
    await blank();
    await readyForOffline(page, blank);

    // Offline: Mark all present, three absent, save.
    await device.setOffline(true);
    await expect(
      page.getByText("You're offline. Attendance will sync automatically when you're back online."),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Mark all present' }).click();
    for (const s of students.slice(0, 3))
      await page
        .getByRole('group', { name: `Attendance for ${s.name}` })
        .getByRole('button', { name: 'Absent' })
        .click();
    await expect(page.getByText(counts(22, 3))).toBeVisible();
    await page.getByRole('button', { name: 'Save attendance' }).click();
    await expect(page.getByText('Saved on this device — 25 records waiting to sync')).toBeVisible();

    // Reload while offline: the cached screen opens and the marks are still there.
    await page.reload();
    await expect(page.getByText(counts(22, 3))).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Saved on this device — 25 records waiting to sync')).toBeVisible();

    // Close the app and open it again, still offline.
    await device.close();
    device = await launchDevice(dir, testInfo);
    await device.setOffline(true);
    page = device.pages()[0] ?? (await device.newPage());
    await page.goto(attendanceUrl);
    await expect(page.getByText(counts(22, 3))).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Saved on this device — 25 records waiting to sync')).toBeVisible();
    expect(await rollCall(admin, sessionId)).toMatchObject({ counts: { PRESENT: 0, ABSENT: 0 } });

    // Back online — and the first push's answer is lost on its way back: the server applied it,
    // the device retries, and the server answers DUPLICATE. Still one roll call.
    let lost = false;
    await device.route('**/api/v1/sync/push', async (route) => {
      if (!lost) {
        lost = true;
        await route.fetch();
        await route.abort('failed');
        return;
      }
      await route.continue();
    });
    await device.setOffline(false);
    await expect(page.getByText('All changes synced', { exact: true })).toBeVisible({
      timeout: 120_000,
    });
    expect(lost).toBe(true);

    const roll = await rollCall(admin, sessionId);
    expect(roll.counts).toMatchObject({ PRESENT: 22, ABSENT: 3, unmarked: 0 });
    const [ledger] = await inAcademy<{ n: number }>(
      'demo-a',
      `SELECT count(*)::int AS n FROM sync_operation WHERE entity_key = $1`,
      [`session:${sessionId}`],
    );
    expect(ledger?.n).toBe(1);
    const [intents] = await inAcademy<{ n: number }>(
      'demo-a',
      `SELECT count(*)::int AS n FROM notification_intent
        WHERE session_id = $1 AND kind = 'ATTENDANCE_ABSENT' AND status = 'PENDING'`,
      [sessionId],
    );
    expect(intents?.n).toBe(3);
    await device.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
    await admin.context.close();
  }
});

test('two devices: a conflict is shown and resolved, never overwritten silently', async ({
  page,
  context,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === 'iphone-webkit', 'Offline emulation: Chromium only');
  test.skip(tooLateToday(), 'Too close to midnight in India for a class today');
  test.setTimeout(180_000);
  await ownClientIp(context);
  const tag = `${testInfo.project.name.split('-')[0]} ${Date.now().toString(36)}`;
  const admin = await adminSession(browser, testInfo);
  const { sessionId, students } = await classForDemoTeacher(admin, `Odissi ${tag}`, 2);
  const [first] = students;
  try {
    await signInAt(page, testInfo, 'demo-a', 'teacher@demo-a.test');
    await page.goto(hostUrl(testInfo, 'demo-a', `/teach/attendance?session=${sessionId}`));
    await expect(page.getByText(counts(0, 0, 2))).toBeVisible({ timeout: 30_000 });

    // The teacher, offline, marks the first student absent.
    await context.setOffline(true);
    await page
      .getByRole('group', { name: `Attendance for ${first!.name}` })
      .getByRole('button', { name: 'Absent' })
      .click();
    await page.getByRole('button', { name: 'Save attendance' }).click();
    await expect(page.getByText('Saved on this device — 1 record waiting to sync')).toBeVisible();

    // Meanwhile the admin, on another device, marks the same student late.
    await adminCall(admin, 'put', `/sessions/${sessionId}/attendance`, {
      marks: [{ studentId: first!.id, status: 'LATE' }],
    });

    // Back online: the server reports a conflict; nothing is overwritten.
    await context.setOffline(false);
    await expect(page.getByText('1 item needs attention')).toBeVisible({ timeout: 90_000 });
    expect((await rollCall(admin, sessionId)).counts).toMatchObject({ LATE: 1, ABSENT: 0 });

    // The teacher chooses in Sync: keep mine (Absent).
    await page.goto(hostUrl(testInfo, 'demo-a', '/teach/sync'));
    await expect(
      page.getByRole('heading', { name: 'Someone else changed attendance' }),
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Keep Arjun Admin's: Late")).toBeVisible();
    await page.getByLabel('Keep mine: Absent').check();
    await page.getByRole('button', { name: 'Save choices' }).click();
    await expect(page.getByText('All changes synced', { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    expect((await rollCall(admin, sessionId)).counts).toMatchObject({ ABSENT: 1, LATE: 0 });
  } finally {
    await admin.context.close();
  }
});

test('signing out with unsynced records asks first; signing out deletes this device’s data', async ({
  page,
  context,
  browser,
}, testInfo) => {
  test.skip(tooLateToday(), 'Too close to midnight in India for a class today');
  test.setTimeout(180_000);
  await ownClientIp(context);
  const tag = `${testInfo.project.name.split('-')[0]} ${Date.now().toString(36)}`;
  const admin = await adminSession(browser, testInfo);
  const { sessionId } = await classForDemoTeacher(admin, `Garba ${tag}`, 2);
  try {
    await signInAt(page, testInfo, 'demo-a', 'teacher@demo-a.test');
    await page.goto(hostUrl(testInfo, 'demo-a', `/teach/attendance?session=${sessionId}`));
    await expect(page.getByText(counts(0, 0, 2))).toBeVisible({ timeout: 30_000 });
    // The academy can't be reached for syncing (online, but every push fails).
    await context.route('**/api/v1/sync/push', (route) => route.abort('failed'));
    await page.getByRole('button', { name: 'Mark all present' }).click();
    await page.getByRole('button', { name: 'Save attendance' }).click();
    await expect(page.getByText('Saved on this device — 2 records waiting to sync')).toBeVisible();

    await page.goto(hostUrl(testInfo, 'demo-a', '/teach/more'));
    await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText("Changes haven't synced")).toBeVisible();
    await expect(dialog.getByText(/2 records haven't synced/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Stay signed in' }).click();
    await expect(page).toHaveURL(/\/teach\/more$/);

    await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sign out and lose them' }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    const left = await page.evaluate(async () =>
      (await indexedDB.databases()).map((d) => d.name).filter((n) => n?.startsWith('ab_')),
    );
    expect(left).toEqual([]);
  } finally {
    await admin.context.close();
  }
});
