import { createAppClient, type PrismaClient } from '@academybee/database';
import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';

import { API_CONFIG } from '../config/config.module.js';
import { type ApiConfig } from '../config/config.schema.js';

export const APP_DB = Symbol('APP_DB');

@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
  constructor(@Inject(APP_DB) private readonly db: PrismaClient) {}
  async onApplicationShutdown(): Promise<void> {
    await this.db.$disconnect();
  }
}

/**
 * The app database client (`ab_app`, ADR-005). Phase 1 replaces direct use with the
 * tenant-bound client; the platform client is provided only by src/platform/**.
 */
@Global()
@Module({
  providers: [
    {
      provide: APP_DB,
      inject: [API_CONFIG],
      useFactory: (config: ApiConfig) => createAppClient(config.DATABASE_URL),
    },
    DatabaseShutdown,
  ],
  exports: [APP_DB],
})
export class DatabaseModule {}
