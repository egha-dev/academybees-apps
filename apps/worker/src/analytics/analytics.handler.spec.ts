import { newId } from '@academybee/contracts';
import { describe, expect, it } from 'vitest';

import { type WorkerConfig } from '../config/config.js';
import { type DomainEventsWorker } from '../events/domain-events.worker.js';
import { NoopAnalyticsAdapter } from './adapters.js';
import { AnalyticsHandler } from './analytics.handler.js';
import { hashId } from './hash.js';

const config = { ANALYTICS_HASH_SALT: 'salt-123456', APP_ENV: 'ci' } as WorkerConfig;
const handler = new AnalyticsHandler({} as DomainEventsWorker, new NoopAnalyticsAdapter(), config);
const tenantId = newId();
const userId = newId();
const base = {
  name: 'system.service_started',
  version: 1,
  properties: { service: 'api', appEnv: 'ci' },
  tenantId,
  userId,
  occurredAt: '2026-09-30T10:00:00.000Z',
};

describe('AnalyticsHandler', () => {
  it('hashes tenant and user IDs and never forwards raw IDs', () => {
    const captured = handler.toCaptured(base)!;
    expect(captured.distinctId).toBe(hashId('salt-123456', 'u', userId));
    expect(captured.groups).toEqual({ academy: hashId('salt-123456', 't', tenantId) });
    expect(JSON.stringify(captured)).not.toContain(tenantId);
    expect(JSON.stringify(captured)).not.toContain(userId);
    expect(captured.properties).toEqual({ service: 'api', appEnv: 'ci', eventVersion: 1 });
  });

  it('drops events with PII, unknown names or malformed payloads', () => {
    expect(
      handler.toCaptured({ ...base, properties: { ...base.properties, email: 'a@b.co' } }),
    ).toBeNull();
    expect(handler.toCaptured({ ...base, name: 'made.up' })).toBeNull();
    expect(handler.toCaptured({ nope: true })).toBeNull();
  });

  it('uses a system distinct ID when there is no user or tenant', () => {
    expect(handler.toCaptured({ ...base, tenantId: null, userId: null })!.distinctId).toBe(
      'system:api',
    );
  });
});

describe('hashId', () => {
  it('is stable per salt and differs across salts and kinds', () => {
    expect(hashId('s1', 'u', 'x')).toBe(hashId('s1', 'u', 'x'));
    expect(hashId('s1', 'u', 'x')).not.toBe(hashId('s2', 'u', 'x'));
    expect(hashId('s1', 'u', 'x')).not.toBe(hashId('s1', 't', 'x'));
    expect(hashId('s1', 'u', 'x')).toMatch(/^u_[0-9a-f]{32}$/);
  });
});
