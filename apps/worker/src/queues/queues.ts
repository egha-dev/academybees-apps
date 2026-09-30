import { type QueueName } from '@academybee/contracts';
import { type DefaultJobOptions, Queue, type WorkerOptions } from 'bullmq';
import { Redis } from 'ioredis';

/** BullMQ needs `maxRetriesPerRequest: null` on blocking connections. */
export function createRedisConnection(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null, enableReadyCheck: true });
}

/**
 * Retries with exponential backoff; completed jobs kept 24 h (so a re-relayed outbox event with
 * the same jobId is deduplicated), failed jobs kept 7 days for inspection.
 */
export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2_000 },
  removeOnComplete: { age: 24 * 3600, count: 10_000 },
  removeOnFail: { age: 7 * 24 * 3600, count: 5_000 },
};

export function createQueue(name: QueueName, connection: Redis): Queue {
  return new Queue(name, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
}

export const WORKER_DEFAULTS: Omit<WorkerOptions, 'connection'> = {
  concurrency: 5,
  autorun: true,
};
