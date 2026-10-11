import { Redis } from 'ioredis';

import type { ApiConfig } from '../config/config.schema.js';

/** BullMQ needs its own connection settings (no command retries limit for blocking calls). */
export function bullConnection(config: ApiConfig): Redis {
  return new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
}
