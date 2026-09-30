import { type TransactionClient } from '@academybee/database';
import { type ClsService } from 'nestjs-cls';
import { describe, expect, it, vi } from 'vitest';

import { type RequestContext } from '../context/request-context.js';
import { type OutboxService } from '../outbox/outbox.service.js';
import { AnalyticsService } from './analytics.service.js';

/** Phase 0 exit gate (G-09): an event with an email/phone property never reaches the outbox. */
describe('AnalyticsService PII guard', () => {
  const outbox = { write: vi.fn().mockResolvedValue('id') };
  const cls = { isActive: () => false } as unknown as ClsService<RequestContext>;
  const service = new AnalyticsService(outbox as unknown as OutboxService, cls);
  const tx = {} as TransactionClient;

  it.each([{ email: 'priya@example.com' }, { phone: '+91 98765 43210' }])(
    'rejects %j',
    async (extra) => {
      await expect(
        service.track(tx, 'system.service_started', {
          service: 'api',
          appEnv: 'ci',
          ...extra,
        } as never),
      ).rejects.toThrow();
      expect(outbox.write).not.toHaveBeenCalled();
    },
  );

  it('writes a valid event to the outbox with raw IDs kept internal', async () => {
    await service.track(tx, 'system.service_started', { service: 'api', appEnv: 'ci' });
    expect(outbox.write).toHaveBeenCalledWith(tx, {
      type: 'analytics.event',
      tenantId: null,
      payload: expect.objectContaining({
        name: 'system.service_started',
        version: 1,
        properties: { service: 'api', appEnv: 'ci' },
        userId: null,
      }) as unknown,
    });
  });
});
