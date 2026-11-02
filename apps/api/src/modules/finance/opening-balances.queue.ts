import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

import { API_CONFIG } from '../../core/config/config.module.js';
import type { ApiConfig } from '../../core/config/config.schema.js';
import { bullConnection } from '../../core/redis/bull-connection.js';

/** Opening-balance imports (G-02): consumed inside the API, like student imports (C-100). */
export const OPENING_BALANCES_QUEUE = 'opening-balance-imports';

export type OpeningBalancesJob = {
  tenantId: string;
  /** Who started it: the processor re-checks they still may (CLAUDE §9). */
  userId: string;
  jobId: string;
  action: 'parse' | 'commit';
};

@Injectable()
export class OpeningBalancesQueue implements OnApplicationShutdown {
  private readonly connection: Redis;
  private readonly queue: Queue<OpeningBalancesJob>;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.connection = bullConnection(config);
    this.queue = new Queue<OpeningBalancesJob>(OPENING_BALANCES_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 86_400, count: 1000 },
        removeOnFail: { age: 7 * 86_400 },
      },
    });
  }

  async add(job: OpeningBalancesJob): Promise<void> {
    // One queue job per step; the job id dedupes double clicks.
    await this.queue.add(job.action, job, { jobId: `${job.jobId}-${job.action}` });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
