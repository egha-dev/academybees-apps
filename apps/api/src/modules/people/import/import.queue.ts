import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

import { API_CONFIG } from '../../../core/config/config.module.js';
import type { ApiConfig } from '../../../core/config/config.schema.js';

/** BullMQ queue for student imports (C-100): consumed inside the API process. */
export const IMPORT_QUEUE = 'student-imports';

export type ImportJobData = {
  tenantId: string;
  /** Who started it: the processor re-checks they may still import (CLAUDE §9). */
  userId: string;
  jobId: string;
  action: 'parse' | 'commit';
};

/** BullMQ needs its own connection settings (no command retries limit for blocking calls). */
export function bullConnection(config: ApiConfig): Redis {
  return new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
}

@Injectable()
export class ImportQueue implements OnApplicationShutdown {
  private readonly connection: Redis;
  private readonly queue: Queue<ImportJobData>;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.connection = bullConnection(config);
    this.queue = new Queue<ImportJobData>(IMPORT_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { age: 86_400, count: 1000 },
        removeOnFail: { age: 7 * 86_400 },
      },
    });
  }

  async add(data: ImportJobData): Promise<void> {
    // One queue job per import step; the job id dedupes double clicks.
    await this.queue.add(data.action, data, { jobId: `${data.jobId}-${data.action}` });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
