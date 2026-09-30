import { type PrismaClient, withTransaction } from '@academybee/database';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { API_CONFIG } from '../config/config.module.js';
import { type ApiConfig } from '../config/config.schema.js';
import { APP_DB } from '../database/database.module.js';
import { AnalyticsService } from './analytics.service.js';

/** Emits `system.service_started` once per boot — the first event visible in dev (task 0.16). */
@Injectable()
export class ServiceStartedEmitter implements OnApplicationBootstrap {
  private readonly logger = new Logger('Analytics');

  constructor(
    private readonly analytics: AnalyticsService,
    @Inject(APP_DB) private readonly db: PrismaClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.NODE_ENV === 'test') return;
    try {
      await withTransaction(this.db, (tx) =>
        this.analytics.track(tx, 'system.service_started', {
          service: 'api',
          appEnv: this.config.APP_ENV,
        }),
      );
    } catch (error) {
      // Analytics must never stop the API from starting.
      this.logger.warn({ err: error }, 'Could not record service start');
    }
  }
}
