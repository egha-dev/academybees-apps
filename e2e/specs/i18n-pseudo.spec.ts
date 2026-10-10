import { expect, type Page, test } from '@playwright/test';

import { ownClientIp } from '../support/client-ip.js';
import { hostUrl } from '../support/hosts.js';

/**
 * G-32 exit gate: in the en-XA build every catalogue string is accented, so any plain ASCII
 * word on screen is hard-coded text. In both en-XA and en-LONG (+40 %) builds nothing may
 * overflow horizontally. Values that are data, not catalogue text (token names, Intl output),
 * are marked `data-i18n-exempt`.
 */
const PAGES = ['/', '/offline', '/dev/design-system', '/does-not-exist'];
/** Academy hosts: sign-in (Phase 2), status pages, Family Hub and console sign-in. */
const HOST_PAGES = ['demo-a', 'nope', 'paused', 'closed-demo', 'setup-demo', 'app', 'console'];
/** Phase 2 sign-in screens on an academy host (`demo-a` above shows the login page). */
const AUTH_PATHS = [
  '/forgot-password',
  '/reset-password#token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
];
/** Seeded academy and user names are data, not catalogue text (C-54). */
const DATA_VALUES = [
  'Demo A Academy',
  'Paused Karate Club',
  'Setup Music School',
  'Asha Owner',
  'owner@demo-a.test',
  // Student 360 of the seeded Aarav (Phase 4): people, classes and the custom field are data.
  'Aarav Sharma',
  'Priya Sharma',
  'parent@demo-a.test',
  'Grade 8 — Evening',
  'Grade 8',
  'Mathematics',
  'Board',
  'CBSE',
  'ICSE',
  'State board',
  // Teachers (Phase 4 S4): seeded teacher names.
  'Demo Owner',
  'Demo Teacher',
  'teacher@demo-a.test',
];
/** Intl output (dates, times) is formatted data, not catalogue text (G-32). */
const DATA_PATTERNS = [
  /\b\d{1,2} [A-Z][a-z]{2,8} \d{4}\b/g, // 6 Oct 2026
  /\b\d{1,2}:\d{2}\s?[ap]m\b/gi, // 5:30 pm
  /\b(?:Africa|America|Asia|Atlantic|Australia|Europe|Indian|Pacific|Etc)\/[A-Za-z_ /-]+/g, // Asia/Kolkata (IANA ids)
  /\b(?:INR|AED|SGD|GBP|USD|EUR|AUD|CAD)\b/g, // ISO currency codes
  /\bADM-\d{4}\b/g, // admission numbers
  /\+\d{10,15}\b/g, // phone numbers
  /\b20\d{2}-\d{2}-draft\b|\bdemo\b/g, // privacy notice versions
];
/** Signed-in pages (Phases 2–4), opened as the seeded owner (signed in through the API). */
const SIGNED_IN_PATHS = [
  '/settings/security',
  '/settings/team',
  '/settings/academy',
  '/settings/branding',
  '/settings/custom-fields',
  '/students/01a10000-0000-7000-8000-00000000a001',
  '/students/01a10000-0000-7000-8000-00000000a001?tab=activity',
  // Not the Teachers list: other specs add teachers to demo-a, so its names vary per run.
  '/teachers/01a10000-0000-7000-8000-00000000e002',
];
const DEV_PASSWORD = 'AcademyBees#2026';
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 900 },
];

async function hardCodedText(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ dataValues, patterns }) => {
      const found: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (
          !parent ||
          parent.closest('script, style, noscript, [data-i18n-exempt], [aria-hidden="true"]')
        )
          continue;
        let text = node.textContent?.trim() ?? '';
        for (const value of dataValues) text = text.split(value).join('');
        for (const pattern of patterns) text = text.replace(new RegExp(pattern, 'gi'), '');
        if (/[A-Za-z]{2,}/.test(text)) found.push(text);
      }
      return found;
    },
    { dataValues: DATA_VALUES, patterns: DATA_PATTERNS.map((p) => p.source) },
  );
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

for (const viewport of VIEWPORTS) {
  for (const path of PAGES) {
    test(`${path} (${viewport.name}) has no hard-coded text or overflow`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      if (testInfo.project.name === 'pseudo-accented') {
        expect(await hardCodedText(page)).toEqual([]);
      }
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({
        path: `artifacts/screenshots/${testInfo.project.name}-${viewport.name}${path.replace(/\//g, '_') || '_home'}.png`,
        fullPage: true,
      });
    });
  }
}

for (const viewport of VIEWPORTS) {
  for (const subdomain of HOST_PAGES) {
    test(`${subdomain}.localhost (${viewport.name}) has no hard-coded text or overflow`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(hostUrl(testInfo, subdomain));
      await page.waitForLoadState('networkidle');
      if (testInfo.project.name === 'pseudo-accented') {
        expect(await hardCodedText(page)).toEqual([]);
      }
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({
        path: `artifacts/screenshots/${testInfo.project.name}-${viewport.name}_${subdomain}.png`,
        fullPage: true,
      });
    });
  }
}

for (const viewport of VIEWPORTS) {
  for (const path of AUTH_PATHS) {
    test(`demo-a${path.slice(0, 20)} (${viewport.name}) has no hard-coded text or overflow`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(hostUrl(testInfo, 'demo-a', path));
      await page.waitForLoadState('networkidle');
      if (testInfo.project.name === 'pseudo-accented') {
        expect(await hardCodedText(page)).toEqual([]);
      }
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });
  }
}

for (const viewport of VIEWPORTS) {
  for (const path of SIGNED_IN_PATHS) {
    test(`signed-in ${path} (${viewport.name}) has no hard-coded text or overflow`, async ({
      page,
      context,
    }, testInfo) => {
      // Its own client address: these tests sign in often, past the per-IP limit otherwise.
      await ownClientIp(context);
      const login = await context.request.post(hostUrl(testInfo, 'demo-a', '/api/v1/auth/login'), {
        data: { identifier: 'owner@demo-a.test', password: DEV_PASSWORD },
      });
      expect(login.status()).toBe(200);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(hostUrl(testInfo, 'demo-a', path));
      await expect(page).toHaveURL(hostUrl(testInfo, 'demo-a', path));
      await page.waitForLoadState('networkidle');
      if (testInfo.project.name === 'pseudo-accented') {
        expect(await hardCodedText(page)).toEqual([]);
      }
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });
  }
}
