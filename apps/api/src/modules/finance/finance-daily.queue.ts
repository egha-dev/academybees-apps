import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

import { API_CONFIG } from '../../core/config/config.module.js';
import type { ApiConfig } from '../../core/config/config.schema.js';
import { bullConnection } from '../../core/redis/bull-connection.js';

/** One academy's nightly finance run: consumed inside the API, like generation (C-112). */
export const FINANCE_DAILY_QUEUE = 'finance-daily';

export type FinanceDailyJob = { tenantId: string };

@Injectable()
export class FinanceDailyQueue implements OnApplicationShutdown {
  private readonly connection: Redis;
  private readonly queue: Queue<FinanceDailyJob>;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.connection = bullConnection(config);
    this.queue = new Queue<FinanceDailyJob>(FINANCE_DAILY_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 86_400, count: 2000 },
        removeOnFail: { age: 7 * 86_400 },
      },
    });
  }

  /** One job per academy per day (re-queuing the same day is a no-op). */
  async add(job: FinanceDailyJob, slot: string): Promise<void> {
    await this.queue.add('academy', job, { jobId: `${job.tenantId}-${slot}` });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
