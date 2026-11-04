import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { Browser } from 'playwright-core';

import { API_CONFIG } from '../../../core/config/config.module.js';
import type { ApiConfig } from '../../../core/config/config.schema.js';

const IDLE_MS = 60_000;
const RENDER_TIMEOUT_MS = 30_000;
/** 105 mm at the browser's 96 dpi. */
const MOBILE_WIDTH_PX = 397;

/**
 * Prints HTML with headless Chromium (C-137). One shared browser, closed when idle so it costs no
 * memory between documents; started only on first use. Each document gets a fresh context with
 * scripts off and every request refused: it can only ever see the HTML it was given.
 */
@Injectable()
export class PdfRenderer implements OnApplicationShutdown {
  private browser: Promise<Browser> | undefined;
  private idle: NodeJS.Timeout | undefined;

  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}

  async render(html: string, layout: 'A4' | 'MOBILE'): Promise<Uint8Array> {
    if (this.idle) clearTimeout(this.idle);
    this.browser ??= this.launch();
    const browser = await this.browser;
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: layout === 'A4' ? 794 : MOBILE_WIDTH_PX, height: 1123 },
    });
    try {
      await context.route('**/*', (route) => route.abort());
      const page = await context.newPage();
      page.setDefaultTimeout(RENDER_TIMEOUT_MS);
      await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS });
      await page.emulateMedia({ media: 'print' });
      // Strings, not functions: this runs in the page, which this package has no DOM types for.
      await page.evaluate('document.fonts.ready.then(() => undefined)');
      if (layout === 'A4') {
        return await page.pdf({ format: 'A4', printBackground: true });
      }
      // One long page, like a phone receipt.
      const height = await page.evaluate<number>('document.documentElement.scrollHeight');
      return await page.pdf({
        width: `${MOBILE_WIDTH_PX}px`,
        height: `${height + 8}px`,
        printBackground: true,
      });
    } finally {
      await context.close().catch(() => undefined);
      this.idle = setTimeout(() => void this.close(), IDLE_MS);
      this.idle.unref();
    }
  }

  private async launch(): Promise<Browser> {
    const { chromium } = await import('playwright-core');
    // No sandbox: the container runs without user namespaces, and the page has no scripts,
    // no network and only escaped content (C-160).
    const browser = await chromium.launch({
      ...(this.config.CHROMIUM_PATH ? { executablePath: this.config.CHROMIUM_PATH } : {}),
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    browser.on('disconnected', () => {
      this.browser = undefined;
    });
    return browser;
  }

  private async close(): Promise<void> {
    const browser = this.browser;
    this.browser = undefined;
    if (browser) await (await browser).close().catch(() => undefined);
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.idle) clearTimeout(this.idle);
    await this.close();
  }
}
