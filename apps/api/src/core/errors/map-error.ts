import { ERROR_HTTP_STATUS, type ErrorCode, type ErrorDetail } from '@academybee/contracts';
import {
  IdempotencyClaimLostError,
  Prisma,
  TenantMismatchError,
  uniqueIndexFields,
} from '@academybee/database';
import { HttpException } from '@nestjs/common';
import { ZodError } from 'zod';

import { DomainError } from './domain-error.js';

export type MappedError = {
  status: number;
  code: ErrorCode;
  details?: ErrorDetail[];
  /** true when the error is unexpected and must be logged with its stack. */
  unexpected: boolean;
  /** A client-error status with no code of its own (review L4): logged, mapped to 400. */
  unmappedStatus?: number;
};

const HTTP_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'VALIDATION_FAILED',
  415: 'VALIDATION_FAILED',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

function withCode(code: ErrorCode, details?: ErrorDetail[], unexpected = false): MappedError {
  return {
    status: ERROR_HTTP_STATUS[code],
    code,
    ...(details && details.length > 0 ? { details } : {}),
    unexpected,
  };
}

export function zodDetails(error: ZodError): ErrorDetail[] {
  return error.issues.slice(0, 50).map((issue) => ({
    path: issue.path.map(String).join('.') || '(body)',
    issue: issue.code,
  }));
}

/** Field names of a unique violation, from Prisma's error metadata (never values or SQL). */
function uniqueFields(error: Prisma.PrismaClientKnownRequestError): string[] {
  const meta = error.meta as
    | {
        target?: unknown;
        driverAdapterError?: { cause?: { constraint?: { fields?: unknown; index?: unknown } } };
      }
    | undefined;
  const constraint = meta?.driverAdapterError?.cause?.constraint;
  const fields = constraint?.fields ?? meta?.target;
  if (Array.isArray(fields)) return fields.map(String);
  // Driver adapters report only the index name; map it via the committed migrations.
  if (typeof constraint?.index === 'string') return uniqueIndexFields(constraint.index) ?? [];
  return [];
}

/**
 * An HTTP status from Nest or Express. Known ones have codes; any other 4xx is the client's
 * problem, so it answers 400 and is logged so we can map it (review L4: it used to become a
 * silent 500); anything else is a server error.
 */
function fromStatus(status: number): MappedError {
  const code = HTTP_CODE[status];
  if (code) return withCode(code);
  if (status >= 400 && status < 500)
    return { ...withCode('VALIDATION_FAILED'), unmappedStatus: status };
  return withCode('INTERNAL', undefined, true);
}

/** The driver error may arrive wrapped by Prisma; recognise it through its causes. */
function isClaimLost(error: unknown): boolean {
  for (let e: unknown = error, depth = 0; e && depth < 5; depth++) {
    if (e instanceof IdempotencyClaimLostError) return true;
    if (e instanceof Error && e.message.includes('idempotency claim lost')) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/** Translate any thrown value into a safe envelope code + status. */
export function mapError(error: unknown): MappedError {
  if (error instanceof DomainError) return withCode(error.code, error.details);
  if (error instanceof ZodError) return withCode('VALIDATION_FAILED', zodDetails(error));
  // Another academy's id reached the tenant-bound client from request input: report it like any
  // record outside the caller's academy (Phase 1 review follow-up; ADR-008 no existence leak).
  if (error instanceof TenantMismatchError) return withCode('NOT_FOUND');
  // A retry took this request's idempotency key over (its lease ran out); this attempt's
  // transaction was rolled back, and the retry's outcome is the one that counts (review M1).
  if (isClaimLost(error)) return withCode('IDEMPOTENCY_KEY_IN_PROGRESS');

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return withCode(
        'CONFLICT',
        uniqueFields(error).map((path) => ({ path, issue: 'already_exists' })),
      );
    }
    if (error.code === 'P2025') return withCode('NOT_FOUND');
    // Invalid value for a column (e.g. a malformed UUID in a path). Bodies are validated by Zod
    // first, so this is an identifier the client made up: not found, never a 500 (ADR-013).
    if (error.code === 'P2007') return withCode('NOT_FOUND');
    if (error.code === 'P2034') return withCode('CONFLICT');
    return withCode('INTERNAL', undefined, true);
  }

  if (error instanceof HttpException) return fromStatus(error.getStatus());

  // Express body-parser errors (malformed JSON, payload too large) carry a `status`.
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number') return fromStatus(status);

  return withCode('INTERNAL', undefined, true);
}
