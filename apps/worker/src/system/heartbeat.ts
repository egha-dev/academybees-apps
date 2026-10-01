import { type JobEnvelope, QUEUES } from '@academybee/contracts';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type Job, type Queue, Worker } from 'bullmq';
import { type Redis } from 'ioredis';

import { WORKER_CONFIG, type WorkerConfig } from '../config/config.js';
import { reportError } from '../observability/error-reporting.js';
import { createQueue, WORKER_DEFAULTS } from '../queues/queues.js';
import { REDIS_CONNECTION } from '../queues/redis.provider.js';

export const HEARTBEAT_KEY = 'worker:heartbeat';
export const HEARTBEAT_JOB = 'heartbeat';

/**
 * `system` queue: a repeatable heartbeat job proves the worker is consuming. The latest beat is
 * stored in Redis (`worker:heartbeat`, expires after 3 intervals) for health checks.
 */
@Injectable()
export class SystemQueueService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('SystemQueue');
  private readonly queue: Queue;
  private worker: Worker | undefined;

  constructor(
    @Inject(WORKER_CONFIG) private readonly config: WorkerConfig,
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
  ) {
    this.queue = createQueue(QUEUES.system, connection);
  }

  async onApplicationBootstrap(): Promise<void> {
    this.worker = new Worker(QUEUES.system, (job) => this.process(job), {
      ...WORKER_DEFAULTS,
      connection: this.connection.duplicate(),
    });
    this.worker.on('failed', (job, err) => {
      this.logger.error({ jobId: job?.id, name: job?.name, err: err.message }, 'System job failed');
      reportError(err, { queue: 'system', jobId: job?.id, job: job?.name });
    });
    const envelope: JobEnvelope<Record<string, never>> = {
      tenantId: 'platform',
      requestId: null,
      actor: { type: 'SYSTEM' },
      data: {},
    };
    await this.queue.upsertJobScheduler(
      HEARTBEAT_JOB,
      { every: this.config.HEARTBEAT_EVERY_MS },
      { name: HEARTBEAT_JOB, data: envelope },
    );
  }

  private async process(job: Job): Promise<void> {
    if (job.name !== HEARTBEAT_JOB) throw new Error(`Unknown system job: ${job.name}`);
    const ttlSeconds = Math.ceil((this.config.HEARTBEAT_EVERY_MS * 3) / 1000);
    await this.connection.set(HEARTBEAT_KEY, new Date().toISOString(), 'EX', ttlSeconds);
    this.logger.debug('Heartbeat');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
  }
}
