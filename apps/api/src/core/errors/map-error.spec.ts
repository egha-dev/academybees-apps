import { IdempotencyClaimLostError, Prisma, TenantMismatchError } from '@academybee/database';
import {
  BadRequestException,
  HttpException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { DomainError } from './domain-error.js';
import { mapError } from './map-error.js';

describe('mapError', () => {
  it('maps domain errors to their code and status', () => {
    expect(mapError(new DomainError('INVALID_STATE_TRANSITION', 'invoice paid'))).toMatchObject({
      status: 409,
      code: 'INVALID_STATE_TRANSITION',
      unexpected: false,
    });
  });

  it('maps Zod errors to VALIDATION_FAILED with paths', () => {
    const result = z.object({ email: z.email() }).safeParse({ email: 'nope' });
    expect(mapError(result.error)).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      details: [{ path: 'email', issue: 'invalid_format' }],
    });
  });

  it('maps a unique violation to CONFLICT with field names only', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed: secret SQL', {
      code: 'P2002',
      clientVersion: '7',
      meta: { target: ['scope', 'key'] },
    });
    expect(mapError(error)).toEqual({
      status: 409,
      code: 'CONFLICT',
      details: [
        { path: 'scope', issue: 'already_exists' },
        { path: 'key', issue: 'already_exists' },
      ],
      unexpected: false,
    });
  });

  it('maps Nest HTTP exceptions', () => {
    expect(mapError(new NotFoundException()).code).toBe('NOT_FOUND');
    expect(mapError(new BadRequestException()).code).toBe('VALIDATION_FAILED');
    expect(mapError(new PayloadTooLargeException()).code).toBe('VALIDATION_FAILED');
  });

  it('maps any other 4xx to 400 and marks it for logging, never a silent 500 (review L4)', () => {
    expect(mapError(new HttpException('gone', 410))).toEqual({
      status: 400,
      code: 'VALIDATION_FAILED',
      unexpected: false,
      unmappedStatus: 410,
    });
    expect(mapError(Object.assign(new Error('timeout'), { status: 408 }))).toMatchObject({
      code: 'VALIDATION_FAILED',
      unmappedStatus: 408,
    });
    expect(mapError(new HttpException('bad gateway', 502))).toMatchObject({
      code: 'INTERNAL',
      unexpected: true,
    });
  });

  it('a lost idempotency claim answers IDEMPOTENCY_KEY_IN_PROGRESS, even wrapped (review M1)', () => {
    expect(mapError(new IdempotencyClaimLostError()).code).toBe('IDEMPOTENCY_KEY_IN_PROGRESS');
    const wrapped = new Error('driver failed', { cause: new IdempotencyClaimLostError() });
    expect(mapError(wrapped).code).toBe('IDEMPOTENCY_KEY_IN_PROGRESS');
  });

  it('treats anything else as INTERNAL and flags it for logging', () => {
    expect(mapError(new TypeError('x is undefined'))).toEqual({
      status: 500,
      code: 'INTERNAL',
      unexpected: true,
    });
  });

  it('reports malformed ids and cross-academy ids as NOT_FOUND, not as internal errors', () => {
    const p2007 = new Prisma.PrismaClientKnownRequestError('invalid input', {
      code: 'P2007',
      clientVersion: 'test',
    });
    expect(mapError(p2007)).toMatchObject({ code: 'NOT_FOUND', status: 404, unexpected: false });
    expect(mapError(new TenantMismatchError('Branch', 'findMany'))).toMatchObject({
      code: 'NOT_FOUND',
      unexpected: false,
    });
  });
});
