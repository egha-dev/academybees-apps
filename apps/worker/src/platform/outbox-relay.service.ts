import { QUEUES } from '@academybee/contracts';
import { createPlatformClient } from '@academybee/database/platform';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type Queue } from 'bullmq';
import { type Redis } from 'ioredis';

import { WORKER_CONFIG, type WorkerConfig } from '../config/config.js';
import { reportError } from '../observability/error-reporting.js';
import { createQueue } from '../queues/queues.js';
import { REDIS_CONNECTION } from '../queues/redis.provider.js';
import { OutboxRelay } from './outbox-relay.js';

/** Polls the outbox and relays committed events to the `domain-events` queue. */
@Injectable()
export class OutboxRelayService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('OutboxRelay');
  private readonly db;
  private readonly queue: Queue;
  private readonly relay: OutboxRelay;
  private running = false;
  private loop: Promise<void> | undefined;
  private wake: (() => void) | undefined;

  constructor(
    @Inject(WORKER_CONFIG) private readonly config: WorkerConfig,
    @Inject(REDIS_CONNECTION) connection: Redis,
  ) {
    this.db = createPlatformClient(config.PLATFORM_DATABASE_URL, { maxConnections: 2 });
    this.queue = createQueue(QUEUES.domainEvents, connection);
    this.relay = new OutboxRelay(this.db, this.queue, {
      batchSize: config.OUTBOX_BATCH_SIZE,
      logger: { warn: (obj, msg) => this.logger.warn(obj, msg) },
    });
  }

  onApplicationBootstrap(): void {
    this.running = true;
    this.loop = this.run();
  }

  private async run(): Promise<void> {
    while (this.running) {
      let relayed = 0;
      try {
        relayed = await this.relay.relayOnce();
        if (relayed > 0) this.logger.debug({ relayed }, 'Outbox events relayed');
      } catch (error) {
        this.logger.error({ err: error }, 'Outbox relay pass failed');
        reportError(error, { component: 'outbox-relay' });
      }
      // A full batch means there is more backlog: go again immediately.
      if (relayed < this.config.OUTBOX_BATCH_SIZE)
        await this.sleep(this.config.OUTBOX_POLL_INTERVAL_MS);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  /** Graceful shutdown: finish the current pass, then close. */
  async onApplicationShutdown(): Promise<void> {
    this.running = false;
    this.wake?.();
    await this.loop;
    await this.queue.close();
    await this.db.$disconnect();
  }
}
