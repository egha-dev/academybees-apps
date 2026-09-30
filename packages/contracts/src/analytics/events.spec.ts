import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { isAnalyticsEventName, parseAnalyticsEvent } from './events.js';
import { defineAnalyticsEvent } from './registry.js';

describe('analytics registry', () => {
  it('validates registered event properties', () => {
    expect(
      parseAnalyticsEvent('system.service_started', { service: 'api', appEnv: 'local' }),
    ).toEqual({ service: 'api', appEnv: 'local' });
  });

  it('rejects unknown properties (no smuggled PII)', () => {
    expect(() =>
      parseAnalyticsEvent('system.service_started', {
        service: 'api',
        appEnv: 'local',
        email: 'a@b.c',
      }),
    ).toThrow();
  });

  it('knows which names are registered', () => {
    expect(isAnalyticsEventName('system.service_started')).toBe(true);
    expect(isAnalyticsEventName('toString')).toBe(false);
  });

  it('enforces area.object_action names', () => {
    expect(() =>
      defineAnalyticsEvent({
        name: 'BadName',
        version: 1,
        description: '',
        properties: z.object({}),
      }),
    ).toThrow(/area.object_action/);
  });
});
