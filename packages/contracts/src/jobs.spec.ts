import { describe, expect, it } from 'vitest';

import { newId } from './ids.js';
import { DomainEventDataSchema, JobEnvelopeSchema } from './jobs.js';

describe('job envelope', () => {
  it('requires tenant (or platform), request ID and actor', () => {
    expect(
      JobEnvelopeSchema.safeParse({
        tenantId: 'platform',
        requestId: null,
        actor: { type: 'SYSTEM' },
        data: {},
      }).success,
    ).toBe(true);
    expect(
      JobEnvelopeSchema.safeParse({
        tenantId: newId(),
        requestId: 'r1',
        actor: { type: 'USER', id: 'u1' },
        data: 1,
      }).success,
    ).toBe(true);
    expect(
      JobEnvelopeSchema.safeParse({
        tenantId: 'demo-a',
        requestId: null,
        actor: { type: 'SYSTEM' },
      }).success,
    ).toBe(false);
    expect(
      JobEnvelopeSchema.safeParse({ tenantId: 'platform', requestId: null, data: {} }).success,
    ).toBe(false);
  });

  it('describes relayed domain events', () => {
    expect(
      DomainEventDataSchema.safeParse({
        eventId: newId(),
        type: 'attendance.session_marked',
        payload: { a: 1 },
        occurredAt: new Date().toISOString(),
      }).success,
    ).toBe(true);
  });
});
