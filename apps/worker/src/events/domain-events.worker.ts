import {
  type DomainEventData,
  DomainEventDataSchema,
  jobEnvelopeSchema,
  QUEUES,
} from '@academybee/contracts';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type Job, Worker } from 'bullmq';
import { type Redis } from 'ioredis';

import { reportError } from '../observability/error-reporting.js';
import { WORKER_DEFAULTS } from '../queues/queues.js';
import { REDIS_CONNECTION } from '../queues/redis.provider.js';

const EnvelopeSchema = jobEnvelopeSchema(DomainEventDataSchema);

export type DomainEventHandler = (event: DomainEventData, job: Job) => Promise<void>;

/**
 * Consumes relayed outbox events. Handlers register by event type in the phases that need them
 * (analytics in S7, notifications in Phase 6 …); events without a handler complete as no-ops.
 * Processors re-establish tenant context from the envelope before touching tenant data (Phase 1).
 */
@Injectable()
export class DomainEventsWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('DomainEvents');
  private readonly handlers = new Map<string, DomainEventHandler[]>();
  private worker: Worker | undefined;

  constructor(@Inject(REDIS_CONNECTION) private readonly connection: Redis) {}

  on(type: string, handler: DomainEventHandler): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }

  onApplicationBootstrap(): void {
    this.worker = new Worker(QUEUES.domainEvents, (job) => this.process(job), {
      ...WORKER_DEFAULTS,
      connection: this.connection.duplicate(),
    });
    this.worker.on('failed', (job, err) => {
      this.logger.error(
        { jobId: job?.id, type: job?.name, err: err.message },
        'Domain event failed',
      );
      reportError(err, { queue: 'domain-events', jobId: job?.id, type: job?.name });
    });
  }

  private async process(job: Job): Promise<void> {
    const envelope = EnvelopeSchema.parse(job.data);
    const handlers = this.handlers.get(envelope.data.type) ?? [];
    for (const handler of handlers) await handler(envelope.data, job);
    this.logger.debug(
      { eventId: envelope.data.eventId, type: envelope.data.type, handlers: handlers.length },
      'Event processed',
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
