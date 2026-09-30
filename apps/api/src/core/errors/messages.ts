import { type ErrorCode } from '@academybee/contracts';

/**
 * TEMPORARY English messages per error code. S7 replaces this with the `errors` namespace of
 * packages/i18n (G-32: no hard-coded user-facing text).
 */
const EN: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'Some details are missing or invalid. Check the highlighted fields.',
  UNAUTHENTICATED: 'Please sign in to continue.',
  SESSION_EXPIRED: 'Your session has expired. Please sign in again.',
  TENANT_MISMATCH: 'Please sign in to this academy to continue.',
  TENANT_UNAVAILABLE: 'This academy is not available right now.',
  FORBIDDEN: "You don't have permission to do this.",
  NOT_FOUND: "We couldn't find what you were looking for.",
  CONFLICT: 'This conflicts with something that already exists.',
  VERSION_CONFLICT: 'Someone else changed this. Reload to see the latest version.',
  IDEMPOTENCY_KEY_REUSED: 'This request was already used for a different action.',
  IDEMPOTENCY_KEY_IN_PROGRESS: 'This request is still being processed. Try again in a moment.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  ENTITLEMENT_LIMIT_REACHED: "You've reached your plan's limit for this.",
  FEATURE_NOT_IN_PLAN: "This feature isn't included in your plan.",
  INVALID_STATE_TRANSITION: "This action isn't possible in the current state.",
  SERVICE_UNAVAILABLE: 'The service is temporarily unavailable. Please try again shortly.',
  INTERNAL: 'Something went wrong on our side. Please try again.',
};

export function errorMessage(code: ErrorCode): string {
  return EN[code];
}
