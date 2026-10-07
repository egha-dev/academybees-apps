import type { ApiError } from '@/lib/api';

/** Pre-translated copy for the auth forms (translated on the server: no ICU runtime, G-24). */
export type FieldLabels = {
  required: string;
  emailInvalid: string;
  passwordHint: string;
  mismatch: string;
  password: { show: string; hide: string; capsLock: string };
  problems: Record<'too_short' | 'too_long' | 'too_common' | 'contains_identifier', string>;
};

/**
 * Waits (minutes) the "try again in …" message is pre-translated for on the server (ICU plurals,
 * no ICU runtime in the browser, G-24). The real wait is rounded up to the next one.
 */
export const RETRY_MINUTES = [1, 2, 3, 4, 5, 10, 15, 20, 30, 45, 60] as const;

export type ErrorLabels = {
  invalidCredentials: string;
  rateLimited: string;
  /** "Try again in N minutes" for each of RETRY_MINUTES. */
  rateLimitedIn?: Partial<Record<number, string>>;
  offline: string;
  network: string;
  generic: string;
};

/** One message for a failed auth call (codes from the API, never raw text, UX §31). */
export function errorMessage(error: ApiError, labels: ErrorLabels): string {
  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return labels.invalidCredentials;
    case 'RATE_LIMITED': {
      const seconds = error.retryAfterSeconds;
      if (!seconds || !labels.rateLimitedIn) return labels.rateLimited;
      const minutes = Math.ceil(seconds / 60);
      const bucket = RETRY_MINUTES.find((m) => m >= minutes) ?? RETRY_MINUTES.at(-1)!;
      return labels.rateLimitedIn[bucket] ?? labels.rateLimited;
    }
    case 'OFFLINE':
      return labels.offline;
    case 'NETWORK':
      return labels.network;
    default:
      return labels.generic;
  }
}

/** Password-policy problems from a VALIDATION_FAILED answer, as one field message. */
export function passwordProblem(error: ApiError, labels: FieldLabels): string | undefined {
  const issue = error.details?.find((d) => d.path === 'password')?.issue;
  return issue && issue in labels.problems
    ? labels.problems[issue as keyof FieldLabels['problems']]
    : undefined;
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
