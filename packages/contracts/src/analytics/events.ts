import { z } from 'zod';

import { defineAnalyticsEvent } from './registry.js';

/** Phase 0: one system event proves the pipeline end to end. Domain events arrive with their phases. */
export const ANALYTICS_EVENTS = {
  'system.service_started': defineAnalyticsEvent({
    name: 'system.service_started',
    version: 1,
    description: 'An API or worker process finished booting.',
    properties: z.strictObject({
      service: z.enum(['api', 'worker']),
      appEnv: z.enum(['local', 'ci', 'staging', 'production']),
    }),
  }),
} as const;

export type AnalyticsEventName = keyof typeof ANALYTICS_EVENTS;

export type AnalyticsEventProperties<N extends AnalyticsEventName> = z.infer<
  (typeof ANALYTICS_EVENTS)[N]['properties']
>;

export function isAnalyticsEventName(name: string): name is AnalyticsEventName {
  return Object.hasOwn(ANALYTICS_EVENTS, name);
}

/** Validate properties for a registered event. Unknown keys are rejected (strict objects). */
export function parseAnalyticsEvent<N extends AnalyticsEventName>(
  name: N,
  properties: unknown,
): AnalyticsEventProperties<N> {
  return ANALYTICS_EVENTS[name].properties.parse(properties) as AnalyticsEventProperties<N>;
}
