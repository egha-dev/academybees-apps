import { generateToken, safeEqual } from './tokens.js';

/**
 * Session cookies (ADR-004/007, ARCHITECTURE §6.2): all host-only (never a `Domain` attribute),
 * httpOnly except the CSRF cookie, SameSite=Lax. Secure deployments use the `__Host-`/`__Secure-`
 * prefixes; plain-http local/ci hosts may use unprefixed names (C-64, config-guarded).
 */
export type CookieMode = 'secure' | 'insecure-dev';

export type CookieSpec = {
  name: string;
  options: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'lax';
    path: string;
    /** Milliseconds; undefined = session cookie. */
    maxAge?: number;
  };
};

export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export function cookieSpecs(mode: CookieMode): {
  access: CookieSpec;
  refresh: CookieSpec;
  csrf: CookieSpec;
  device: CookieSpec;
} {
  const secure = mode === 'secure';
  const name = (prefix: '__Host-' | '__Secure-', base: string) =>
    secure ? `${prefix}${base}` : base;
  return {
    access: {
      name: name('__Host-', 'ab_at'),
      options: { httpOnly: true, secure, sameSite: 'lax', path: '/' },
    },
    // `__Host-` requires Path=/, so the path-restricted refresh cookie uses `__Secure-`.
    refresh: {
      name: name('__Secure-', 'ab_rt'),
      options: { httpOnly: true, secure, sameSite: 'lax', path: REFRESH_COOKIE_PATH },
    },
    csrf: {
      name: name('__Host-', 'ab_csrf'),
      options: { httpOnly: false, secure, sameSite: 'lax', path: '/' },
    },
    // Long-lived device id for new-device alerts (G-11); not a credential.
    device: {
      name: name('__Host-', 'ab_dev'),
      options: {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: 400 * 24 * 3600 * 1000,
      },
    },
  };
}

export const CSRF_HEADER = 'x-csrf-token';

export function generateCsrfToken(): string {
  return generateToken(24);
}

/** Double-submit check: the header must equal the CSRF cookie (both present, constant time). */
export function csrfMatches(
  cookieValue: string | undefined,
  headerValue: string | undefined,
): boolean {
  if (!cookieValue || !headerValue || cookieValue.length < 16) return false;
  return safeEqual(cookieValue, headerValue);
}
