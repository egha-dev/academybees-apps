import { type BrowserContext } from '@playwright/test';

/** Header the E2E web servers trust for the client IP (TRUSTED_CLIENT_IP_HEADER, review M1). */
export const E2E_CLIENT_IP_HEADER = 'x-e2e-client-ip';

/**
 * Give this browser context its own client address, so per-IP sign-in limits (ADR-006) apply to
 * this test alone instead of to every parallel test from 127.0.0.1.
 */
export async function ownClientIp(context: BrowserContext): Promise<void> {
  const octet = () => 1 + Math.floor(Math.random() * 254);
  await context.setExtraHTTPHeaders({
    [E2E_CLIENT_IP_HEADER]: `10.${octet()}.${octet()}.${octet()}`,
  });
}
