import { describe, expect, it } from 'vitest';

import { newId } from './ids.js';
import {
  SYNC_PUSH_MAX_OPS,
  SyncOpResultSchema,
  SyncOpSchema,
  SyncPushRequestSchema,
} from './sync.js';

const op = () => ({
  opId: newId(),
  type: 'attendance.markSession',
  entityKey: 'session:abc',
  payload: { present: ['s1'] },
  baseVersion: 3,
  clientCreatedAt: '2026-09-30T10:00:00+05:30',
  deviceId: 'device-1',
  schemaVersion: 1,
});

describe('sync contracts', () => {
  it('accepts a well-formed op', () => {
    expect(SyncOpSchema.parse(op()).type).toBe('attendance.markSession');
  });

  it('requires a UUIDv7 opId and a known type', () => {
    expect(SyncOpSchema.safeParse({ ...op(), opId: 'x' }).success).toBe(false);
    expect(SyncOpSchema.safeParse({ ...op(), type: 'payment.refund' }).success).toBe(false);
  });

  it('limits a push to 1..100 ops', () => {
    expect(SyncPushRequestSchema.safeParse({ ops: [] }).success).toBe(false);
    const ops = Array.from({ length: SYNC_PUSH_MAX_OPS + 1 }, op);
    expect(SyncPushRequestSchema.safeParse({ ops }).success).toBe(false);
    expect(SyncPushRequestSchema.safeParse({ ops: ops.slice(1) }).success).toBe(true);
  });

  it('models definitive results', () => {
    const opId = newId();
    expect(SyncOpResultSchema.parse({ opId, status: 'APPLIED', serverVersion: 4 }).status).toBe(
      'APPLIED',
    );
    expect(
      SyncOpResultSchema.safeParse({
        opId,
        status: 'REJECTED',
        error: { code: 'FORBIDDEN', message: 'x' },
      }).success,
    ).toBe(true);
    expect(SyncOpResultSchema.safeParse({ opId, status: 'MAYBE' }).success).toBe(false);
  });
});
