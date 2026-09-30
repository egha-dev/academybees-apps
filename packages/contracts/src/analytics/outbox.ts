import { z } from 'zod';

/** Outbox event type that carries a product analytics event from the API to the worker. */
export const ANALYTICS_OUTBOX_TYPE = 'analytics.event';

/**
 * Raw tenant/user IDs stay inside AcademyBee (DB + queue); the worker hashes them before
 * anything reaches an analytics provider (ADR-032).
 */
export const AnalyticsOutboxPayloadSchema = z.object({
  name: z.string(),
  version: z.number().int().positive(),
  properties: z.record(z.string(), z.unknown()),
  tenantId: z.uuid().nullable(),
  userId: z.uuid().nullable(),
  occurredAt: z.iso.datetime(),
});
export type AnalyticsOutboxPayload = z.infer<typeof AnalyticsOutboxPayloadSchema>;
