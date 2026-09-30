import type { z } from 'zod';

/**
 * Product analytics event registry (ADR-032, PRD v3.2 G-09). Every event the product emits is
 * declared here with a Zod schema for its properties. Properties describe *what happened*,
 * never *who*: no names, emails, phones, free text or raw IDs (the port hashes tenant/user IDs
 * and a PII guard rejects anything that looks personal — see the API/worker AnalyticsPort).
 */
export type AnalyticsProperty = string | number | boolean | null;

export type AnalyticsEventDefinition<
  N extends string = string,
  P extends z.ZodObject = z.ZodObject,
> = {
  /** `area.object_action`, e.g. `attendance.session_marked`. */
  name: N;
  /** Bump when the property shape changes incompatibly. */
  version: number;
  description: string;
  properties: P;
};

const EVENT_NAME = /^[a-z][a-z0-9]*\.[a-z][a-z0-9_]*$/;

export function defineAnalyticsEvent<N extends string, P extends z.ZodObject>(
  definition: AnalyticsEventDefinition<N, P>,
): AnalyticsEventDefinition<N, P> {
  if (!EVENT_NAME.test(definition.name)) {
    throw new Error(`Analytics event name must be "area.object_action": ${definition.name}`);
  }
  return definition;
}
