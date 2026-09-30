import { z } from 'zod';

/**
 * Background jobs (ADR-019, CLAUDE.md §9): every job carries tenantId (or 'platform'),
 * requestId and actor, so processors can re-establish tenant context and re-check
 * permissions/state before acting.
 */
export const QUEUES = {
  /** Heartbeat and platform housekeeping. */
  system: 'system',
  /** Events relayed from the transactional outbox. */
  domainEvents: 'domain-events',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const JobActorSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('USER'), id: z.string() }),
  z.object({ type: z.literal('PLATFORM_STAFF'), id: z.string() }),
  z.object({ type: z.literal('SYSTEM') }),
]);
export type JobActor = z.infer<typeof JobActorSchema>;

export function jobEnvelopeSchema<T extends z.ZodType>(data: T) {
  return z.object({
    tenantId: z.union([z.uuid(), z.literal('platform')]),
    requestId: z.string().nullable(),
    actor: JobActorSchema,
    data,
  });
}

export const JobEnvelopeSchema = jobEnvelopeSchema(z.unknown());
export type JobEnvelope<T = unknown> = {
  /** A tenant UUID, or 'platform' for platform-level jobs. */
  tenantId: string;
  requestId: string | null;
  actor: JobActor;
  data: T;
};

/** Data of a relayed outbox event (the job ID is the outbox event ID, for dedupe). */
export const DomainEventDataSchema = z.object({
  eventId: z.uuid(),
  type: z.string(),
  payload: z.unknown(),
  occurredAt: z.iso.datetime(),
});
export type DomainEventData = z.infer<typeof DomainEventDataSchema>;
