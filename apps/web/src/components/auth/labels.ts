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

export type ErrorLabels = {
  invalidCredentials: string;
  rateLimited: string;
  offline: string;
  network: string;
  generic: string;
};

/** One message for a failed auth call (codes from the API, never raw text, UX §31). */
export function errorMessage(error: ApiError, labels: ErrorLabels): string {
  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return labels.invalidCredentials;
    case 'RATE_LIMITED':
      return labels.rateLimited;
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
