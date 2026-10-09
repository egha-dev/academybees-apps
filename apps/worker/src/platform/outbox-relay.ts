// Platform job: spans all tenants, so it uses the platform client (ADR-005, ADR-019).
import {
  type DomainEventData,
  type JobActor,
  type JobEnvelope,
  JobActorSchema,
} from '@academybee/contracts';
import type { PrismaClient } from '@academybee/database';
import type { Queue } from 'bullmq';

type OutboxRow = {
  id: string;
  tenant_id: string | null;
  type: string;
  payload: unknown;
  request_id: string | null;
  actor: unknown;
  created_at: Date;
};

export type RelayLogger = { warn: (obj: object, msg: string) => void };

export function toEnvelope(row: OutboxRow): JobEnvelope<DomainEventData> {
  const actor: JobActor = JobActorSchema.safeParse(row.actor).data ?? { type: 'SYSTEM' };
  return {
    tenantId: row.tenant_id ?? 'platform',
    requestId: row.request_id,
    actor,
    data: {
      eventId: row.id,
      type: row.type,
      payload: row.payload,
      occurredAt: row.created_at.toISOString(),
    },
  };
}

/**
 * Transactional outbox relay (ADR-019). Each pass locks up to `batchSize` undispatched rows with
 * `FOR UPDATE SKIP LOCKED` (so concurrent relays never take the same row), enqueues each with
 * `jobId = outboxEventId` (BullMQ ignores a duplicate jobId, covering a crash between enqueue and
 * commit), then marks them dispatched in the same transaction.
 */
export class OutboxRelay {
  constructor(
    private readonly db: PrismaClient,
    private readonly queue: Queue,
    private readonly options: { batchSize: number; logger?: RelayLogger },
  ) {}

  /** One pass; returns the number of events enqueued. */
  async relayOnce(): Promise<number> {
    return this.db.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<OutboxRow[]>`
          SELECT id, tenant_id, type, payload, request_id, actor, created_at
          FROM outbox_event
          WHERE dispatched_at IS NULL AND available_at <= now()
          ORDER BY available_at, id
          LIMIT ${this.options.batchSize}
          FOR UPDATE SKIP LOCKED`;
        if (rows.length === 0) return 0;

        const dispatched: string[] = [];
        for (const row of rows) {
          try {
            await this.queue.add(row.type, toEnvelope(row), { jobId: row.id });
            dispatched.push(row.id);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.options.logger?.warn({ eventId: row.id, err: message }, 'Outbox enqueue failed');
            await tx.$executeRaw`
              UPDATE outbox_event SET attempts = attempts + 1, last_error = ${message.slice(0, 1000)}
              WHERE id = ${row.id}::uuid`;
          }
        }
        if (dispatched.length > 0) {
          await tx.$executeRaw`
            UPDATE outbox_event SET dispatched_at = now(), attempts = attempts + 1
            WHERE id = ANY(${dispatched}::uuid[])`;
        }
        return dispatched.length;
      },
      { timeout: 30_000 },
    );
  }

  /** Relay until the backlog is empty (bounded), e.g. on start-up. */
  async drain(maxPasses = 1000): Promise<number> {
    let total = 0;
    for (let i = 0; i < maxPasses; i++) {
      const n = await this.relayOnce();
      total += n;
      if (n < this.options.batchSize) break;
    }
    return total;
  }
}
