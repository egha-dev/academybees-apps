import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

import { API_CONFIG } from '../../core/config/config.module.js';
import type { ApiConfig } from '../../core/config/config.schema.js';
import { bullConnection } from '../../core/redis/bull-connection.js';

/** One academy's hourly gateway check: consumed inside the API, like generation (C-112). */
export const RECONCILIATION_QUEUE = 'payment-reconciliation';

export type ReconciliationJob = { tenantId: string };

@Injectable()
export class ReconciliationQueue implements OnApplicationShutdown {
  private readonly connection: Redis;
  private readonly queue: Queue<ReconciliationJob>;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.connection = bullConnection(config);
    this.queue = new Queue<ReconciliationJob>(RECONCILIATION_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 86_400, count: 2000 },
        removeOnFail: { age: 7 * 86_400 },
      },
    });
  }

  /** One job per academy per slot (re-queuing the same hour is a no-op). */
  async add(job: ReconciliationJob, slot: string): Promise<void> {
    await this.queue.add('academy', job, { jobId: `${job.tenantId}-${slot}` });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
