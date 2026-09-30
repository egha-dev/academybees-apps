import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';

import { WORKER_CONFIG, type WorkerConfig } from '../config/config.js';
import { ANALYTICS_PORT, type AnalyticsPort } from './analytics.port.js';

/** The worker reports its own start directly through the port (it has no request transaction). */
@Injectable()
export class WorkerStartedEmitter implements OnApplicationBootstrap {
  constructor(
    @Inject(ANALYTICS_PORT) private readonly port: AnalyticsPort,
    @Inject(WORKER_CONFIG) private readonly config: WorkerConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.port.capture({
      distinctId: 'system:worker',
      event: 'system.service_started',
      properties: { service: 'worker', appEnv: this.config.APP_ENV, eventVersion: 1 },
      timestamp: new Date(),
    });
  }
}
