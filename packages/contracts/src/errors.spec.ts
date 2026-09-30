import { describe, expect, it } from 'vitest';

import { ERROR_HTTP_STATUS, ErrorCode, ErrorEnvelopeSchema, isErrorEnvelope } from './errors.js';

describe('ErrorCode', () => {
  it('contains the ARCHITECTURE §9.1 core codes', () => {
    for (const code of [
      'VALIDATION_FAILED',
      'UNAUTHENTICATED',
      'SESSION_EXPIRED',
      'TENANT_MISMATCH',
      'TENANT_UNAVAILABLE',
      'FORBIDDEN',
      'NOT_FOUND',
      'CONFLICT',
      'VERSION_CONFLICT',
      'IDEMPOTENCY_KEY_REUSED',
      'RATE_LIMITED',
      'ENTITLEMENT_LIMIT_REACHED',
      'FEATURE_NOT_IN_PLAN',
      'INVALID_STATE_TRANSITION',
      'INTERNAL',
    ]) {
      expect(ErrorCode).toHaveProperty(code, code);
    }
  });

  it('maps every code to an HTTP status', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(ERROR_HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
    expect(ERROR_HTTP_STATUS.NOT_FOUND).toBe(404);
    expect(ERROR_HTTP_STATUS.IDEMPOTENCY_KEY_REUSED).toBe(409);
    expect(ERROR_HTTP_STATUS.INTERNAL).toBe(500);
  });
});

describe('ErrorEnvelopeSchema', () => {
  const valid = {
    error: {
      code: 'VALIDATION_FAILED',
      message: 'Check the highlighted fields.',
      details: [{ path: 'email', issue: 'invalid_format' }],
      requestId: '0199a0a0-0000-7000-8000-000000000000',
    },
  };

  it('accepts the documented shape', () => {
    expect(ErrorEnvelopeSchema.parse(valid)).toEqual(valid);
    expect(isErrorEnvelope(valid)).toBe(true);
  });

  it('rejects unknown codes and missing request IDs', () => {
    expect(isErrorEnvelope({ error: { ...valid.error, code: 'OOPS' } })).toBe(false);
    expect(isErrorEnvelope({ error: { code: 'INTERNAL', message: 'x' } })).toBe(false);
  });
});
