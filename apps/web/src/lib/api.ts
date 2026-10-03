import { type ErrorCode } from '@academybee/contracts';

/**
 * Browser calls to the API through the same origin (`/api/*` → proxy.ts → API). Plan 2.15:
 * - mutations carry the CSRF double-submit header (ADR-007);
 * - a 401 `SESSION_EXPIRED` refreshes once (one refresh for all concurrent calls) and retries;
 * - when the session cannot be restored, `SESSION_LOST_EVENT` fires so the re-login dialog can
 *   open over the current page without losing its state.
 * Results are values, never thrown: `{ ok: true, data }` or `{ ok: false, error }`.
 */
export type ApiError = {
  /** An API error code, or `NETWORK` / `OFFLINE` when the request never got an answer. */
  code: ErrorCode | 'NETWORK' | 'OFFLINE';
  status: number;
  details?: Array<{ path: string; issue: string }>;
  retryAfterSeconds?: number;
};
export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; error: ApiError };

export const SESSION_LOST_EVENT = 'ab:session-lost';
const CSRF_COOKIES = ['__Host-ab_csrf', 'ab_csrf'];

function csrfToken(): string | undefined {
  for (const part of document.cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name && CSRF_COOKIES.includes(name)) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

let refreshing: Promise<boolean> | undefined;

/** Rotate the session once, however many requests found it expired at the same time. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          headers: csrfHeader(),
          credentials: 'same-origin',
        });
        if (res.status === 204) return true;
        // 409: another tab rotated it a moment ago; its new cookies are already ours.
        if (res.status !== 409) return false;
        await new Promise((r) => setTimeout(r, 300));
      }
      return true;
    } catch {
      return false;
    } finally {
      // Callers already awaiting this promise still get its answer; later expiries refresh anew.
      refreshing = undefined;
    }
  })();
  return refreshing;
}

function csrfHeader(): Record<string, string> {
  const token = csrfToken();
  return token ? { 'x-csrf-token': token } : {};
}

type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  /** Public calls (sign-in, reset) never try to refresh or announce a lost session. */
  anonymous?: boolean;
};

export async function api<T>(path: string, options: Options = {}): Promise<ApiResult<T>> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    return { ok: false, error: { code: 'OFFLINE', status: 0 } };
  const send = () =>
    fetch(`/api/v1${path}`, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(options.method && options.method !== 'GET' ? csrfHeader() : {}),
        ...options.headers,
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && !options.anonymous) {
      const code = await errorCode(res.clone());
      if (code === 'SESSION_EXPIRED') {
        if (await refreshSession()) res = await send();
        else window.dispatchEvent(new Event(SESSION_LOST_EVENT));
      }
    }
  } catch {
    return { ok: false, error: { code: 'NETWORK', status: 0 } };
  }
  if (res.ok) {
    const data: unknown = res.status === 204 ? undefined : await res.json().catch(() => undefined);
    return { ok: true, status: res.status, data: data as T };
  }
  const body = (await res.json().catch(() => null)) as {
    error?: { code?: ErrorCode; details?: ApiError['details'] };
  } | null;
  const retryAfter = Number(res.headers.get('retry-after'));
  return {
    ok: false,
    error: {
      code: body?.error?.code ?? 'INTERNAL',
      status: res.status,
      ...(body?.error?.details ? { details: body.error.details } : {}),
      ...(retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}),
    },
  };
}

async function errorCode(res: Response): Promise<string | undefined> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
  return body?.error?.code;
}
