import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

import { API_CONFIG } from '../../../core/config/config.module.js';
import type { ApiConfig } from '../../../core/config/config.schema.js';
import { bullConnection } from '../../../core/redis/bull-connection.js';

/** Render one document: consumed inside the API (C-137), one at a time. */
export const DOCUMENTS_QUEUE = 'finance-documents';
export const DOCUMENT_JOB_ATTEMPTS = 3;

export type DocumentJob = { tenantId: string; documentId: string };

@Injectable()
export class DocumentsQueue implements OnApplicationShutdown {
  private readonly connection: Redis;
  private readonly queue: Queue<DocumentJob>;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.connection = bullConnection(config);
    this.queue = new Queue<DocumentJob>(DOCUMENTS_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: DOCUMENT_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 3_600, count: 1000 },
        removeOnFail: { age: 7 * 86_400 },
      },
    });
  }

  /** At most one job per document per minute, so asking again recovers a lost job cheaply. */
  async add(job: DocumentJob): Promise<void> {
    const slot = Math.floor(Date.now() / 60_000);
    await this.queue.add('render', job, { jobId: `${job.documentId}-${slot}` });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
