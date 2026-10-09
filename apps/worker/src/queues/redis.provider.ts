import { Inject, Injectable, type OnApplicationShutdown, type Provider } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { WORKER_CONFIG, type WorkerConfig } from '../config/config.js';
import { createRedisConnection } from './queues.js';

export const REDIS_CONNECTION = Symbol('REDIS_CONNECTION');

export const redisProvider: Provider = {
  provide: REDIS_CONNECTION,
  inject: [WORKER_CONFIG],
  useFactory: (config: WorkerConfig) => createRedisConnection(config.REDIS_URL),
};

@Injectable()
export class RedisShutdown implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CONNECTION) private readonly redis: Redis) {}
  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
