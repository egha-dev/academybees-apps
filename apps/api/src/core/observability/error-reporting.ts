import { maskPii } from '@academybee/contracts';

/**
 * Error tracking (ADR-023, OD-21, C-48): Sentry is loaded only when SENTRY_DSN is set; otherwise
 * every call is a no-op and the SDK is never imported. Events carry no cookies, headers or
 * request bodies, and messages are PII-masked.
 */
type Sentry = typeof import('@sentry/node');

let sentry: Sentry | undefined;

export async function initErrorReporting(options: {
  dsn: string | undefined;
  environment: string;
  service: 'api' | 'worker';
  release?: string | undefined;
}): Promise<boolean> {
  if (!options.dsn) return false;
  sentry = await import('@sentry/node');
  sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    ...(options.release ? { release: options.release } : {}),
    // No personal data: Sentry 11 collects nothing below (beforeSend masks the rest).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      genAI: { inputs: false, outputs: false },
      graphQL: { document: false, variables: false },
    },
    tracesSampleRate: 0,
    defaultIntegrations: false,
    initialScope: { tags: { service: options.service } },
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.data;
        delete event.request.query_string;
      }
      delete event.user;
      if (event.message) event.message = maskPii(event.message);
      if (event.extra) event.extra = maskPii(event.extra);
      for (const ex of event.exception?.values ?? []) {
        if (ex.value) ex.value = maskPii(ex.value);
      }
      return event;
    },
  });
  return true;
}

/** Report an unexpected error (no-op when error tracking is off). */
export function reportError(
  error: unknown,
  context: { requestId?: string; [key: string]: unknown } = {},
): void {
  sentry?.captureException(error, {
    tags: context.requestId ? { requestId: context.requestId } : {},
    extra: context,
  });
}

export async function flushErrorReporting(timeoutMs = 2_000): Promise<void> {
  await sentry?.flush(timeoutMs);
}
