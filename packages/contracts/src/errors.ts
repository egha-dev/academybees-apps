import { z } from 'zod';

/**
 * Stable machine-readable error codes (ADR-013, ARCHITECTURE §9.1).
 * Clients branch on `code`, never on `message`. Messages come from the i18n catalogue
 * (`errors` namespace) keyed by code. Domain modules add their own codes here.
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  /** Wrong identifier or password — one uniform answer, never which part was wrong. */
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  TENANT_UNAVAILABLE: 'TENANT_UNAVAILABLE',
  FORBIDDEN: 'FORBIDDEN',
  /** Also used for out-of-scope records, so existence never leaks. */
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  IDEMPOTENCY_KEY_IN_PROGRESS: 'IDEMPOTENCY_KEY_IN_PROGRESS',
  RATE_LIMITED: 'RATE_LIMITED',
  ENTITLEMENT_LIMIT_REACHED: 'ENTITLEMENT_LIMIT_REACHED',
  FEATURE_NOT_IN_PLAN: 'FEATURE_NOT_IN_PLAN',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ErrorCodeSchema = z.enum(ErrorCode);

/** HTTP status for each code. The API error filter is the only place that uses this. */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  SESSION_EXPIRED: 401,
  TENANT_MISMATCH: 401,
  TENANT_UNAVAILABLE: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VERSION_CONFLICT: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  IDEMPOTENCY_KEY_IN_PROGRESS: 409,
  RATE_LIMITED: 429,
  ENTITLEMENT_LIMIT_REACHED: 403,
  FEATURE_NOT_IN_PLAN: 403,
  INVALID_STATE_TRANSITION: 409,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

/** One problem with the request, e.g. `{ path: 'email', issue: 'invalid_format' }`. */
export const ErrorDetailSchema = z.object({
  path: z.string(),
  issue: z.string(),
});
export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;

/** The only error shape the API ever returns (ARCHITECTURE §9.1). */
export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.array(ErrorDetailSchema).optional(),
    requestId: z.string(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return ErrorEnvelopeSchema.safeParse(value).success;
}
