import { expect, type Page, test } from '@playwright/test';

import { hostUrl } from '../support/hosts.js';

/**
 * G-32 exit gate: in the en-XA build every catalogue string is accented, so any plain ASCII
 * word on screen is hard-coded text. In both en-XA and en-LONG (+40 %) builds nothing may
 * overflow horizontally. Values that are data, not catalogue text (token names, Intl output),
 * are marked `data-i18n-exempt`.
 */
const PAGES = ['/', '/offline', '/dev/design-system', '/does-not-exist'];
/** Academy hosts (Phase 1): academy home, status pages and the Family Hub placeholder. */
const HOST_PAGES = ['demo-a', 'nope', 'paused', 'closed-demo', 'setup-demo', 'app'];
/** Seeded academy names are data, not catalogue text (C-54). */
const DATA_VALUES = ['Demo A Academy', 'Paused Karate Club', 'Setup Music School'];
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 900 },
];

async function hardCodedText(page: Page): Promise<string[]> {
  return page.evaluate((dataValues) => {
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
      if (/[A-Za-z]{2,}/.test(text)) found.push(text);
    }
    return found;
  }, DATA_VALUES);
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
