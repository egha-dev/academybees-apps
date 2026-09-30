import { describe, expect, it } from 'vitest';

import { toEnvelope } from './outbox-relay.js';

const row = {
  id: '0199a0a0-0000-7000-8000-000000000001',
  tenant_id: null,
  type: 'test.event',
  payload: { a: 1 },
  request_id: 'req-1',
  actor: null,
  created_at: new Date('2026-09-30T10:00:00.000Z'),
};

describe('toEnvelope', () => {
  it('builds a platform envelope with a SYSTEM actor when none was recorded', () => {
    expect(toEnvelope(row)).toEqual({
      tenantId: 'platform',
      requestId: 'req-1',
      actor: { type: 'SYSTEM' },
      data: {
        eventId: row.id,
        type: 'test.event',
        payload: { a: 1 },
        occurredAt: '2026-09-30T10:00:00.000Z',
      },
    });
  });

  it('keeps the tenant and a valid recorded actor', () => {
    const tenantId = '0199a0a0-0000-7000-8000-0000000000aa';
    const env = toEnvelope({ ...row, tenant_id: tenantId, actor: { type: 'USER', id: 'u1' } });
    expect(env.tenantId).toBe(tenantId);
    expect(env.actor).toEqual({ type: 'USER', id: 'u1' });
  });

  it('falls back to SYSTEM for a malformed actor', () => {
    expect(toEnvelope({ ...row, actor: { type: 'HACKER' } }).actor).toEqual({ type: 'SYSTEM' });
  });
});
