import { type CookieMode, type CookieSpec, cookieSpecs } from '@academybee/auth';
import { type Request, type Response } from 'express';

/** Parse the Cookie header (no dependency; values are URI-decoded, malformed pairs skipped). */
export function readCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const name = part.slice(0, i).trim();
    try {
      out[name] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // ignore a malformed value
    }
  }
  return out;
}

export const REFRESH_TTL_MS = { TENANT: 30, HUB: 30, CONSOLE: 7 } as const;
const DAY = 24 * 3600 * 1000;

function set(res: Response, spec: CookieSpec, value: string, maxAge?: number) {
  res.cookie(spec.name, value, { ...spec.options, ...(maxAge ? { maxAge } : {}) });
}

/** Write the session cookies (ARCHITECTURE §6.2). */
export function setSessionCookies(
  res: Response,
  mode: CookieMode,
  audience: keyof typeof REFRESH_TTL_MS,
  tokens: { access: string; refresh: string; csrf: string },
): void {
  const c = cookieSpecs(mode);
  const refreshMs = REFRESH_TTL_MS[audience] * DAY;
  set(res, c.access, tokens.access, refreshMs);
  set(res, c.refresh, tokens.refresh, refreshMs);
  set(res, c.csrf, tokens.csrf, refreshMs);
}

export function clearSessionCookies(res: Response, mode: CookieMode): void {
  const c = cookieSpecs(mode);
  for (const spec of [c.access, c.refresh, c.csrf])
    res.clearCookie(spec.name, { ...spec.options, maxAge: undefined });
}

/**
 * A location-free device code for the Devices & sessions page (G-11): `<browser>/<os>`, e.g.
 * `chrome/android`. Codes, not English text — the web translates them (G-32).
 */
export function deviceLabel(userAgent: string | undefined): string {
  const ua = userAgent ?? '';
  const browser = /Edg\//.test(ua)
    ? 'edge'
    : /Chrome\//.test(ua)
      ? 'chrome'
      : /Firefox\//.test(ua)
        ? 'firefox'
        : /Safari\//.test(ua)
          ? 'safari'
          : 'other';
  const os = /Android/.test(ua)
    ? 'android'
    : /iPhone|iPad/.test(ua)
      ? 'ios'
      : /Windows/.test(ua)
        ? 'windows'
        : /Mac OS X/.test(ua)
          ? 'macos'
          : /Linux/.test(ua)
            ? 'linux'
            : 'other';
  return `${browser}/${os}`;
}
