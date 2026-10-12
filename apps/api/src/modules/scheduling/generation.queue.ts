import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

import { API_CONFIG } from '../../core/config/config.module.js';
import type { ApiConfig } from '../../core/config/config.schema.js';
import { bullConnection } from '../../core/redis/bull-connection.js';

/** Per-academy session generation (C-112): consumed inside the API process, like imports (C-100). */
export const SESSION_GENERATION_QUEUE = 'session-generation';

export type SessionGenerationJob = { tenantId: string; reason: 'daily' | 'manual' };

@Injectable()
export class SessionGenerationQueue implements OnApplicationShutdown {
  private readonly connection: Redis;
  private readonly queue: Queue<SessionGenerationJob>;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.connection = bullConnection(config);
    this.queue = new Queue<SessionGenerationJob>(SESSION_GENERATION_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 7 * 86_400, count: 5000 },
        removeOnFail: { age: 14 * 86_400 },
      },
    });
  }

  /**
   * One job per academy and day for the nightly run (re-queuing the same day is a no-op, `jobId`);
   * a run on start (`day` null) always goes through — generation itself is idempotent.
   */
  async add(job: SessionGenerationJob, day: string | null): Promise<void> {
    await this.queue.add(
      'academy',
      job,
      day ? { jobId: `${job.tenantId}-${day}-${job.reason}` } : {},
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
