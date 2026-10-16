import type { TenantBoundClient } from '@academybee/database';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type Job, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { ClsService } from 'nestjs-cls';

import { AnalyticsService } from '../../core/analytics/analytics.service.js';
import { API_CONFIG } from '../../core/config/config.module.js';
import type { ApiConfig } from '../../core/config/config.schema.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { TenantContext } from '../../core/tenant/tenant-context.service.js';
import { bullConnection } from '../../core/redis/bull-connection.js';
import { SESSION_GENERATION_QUEUE, type SessionGenerationJob } from './generation.queue.js';
import { generateSessions } from './session-generator.js';

/**
 * Fills one academy's next 28 days of classes (C-112), in the API process, one academy at a time
 * per instance. The academy's context is re-established from the job; the tenant-bound client
 * does the work, so RLS applies as in a request (CLAUDE §9).
 */
@Injectable()
export class SessionGenerationProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SessionGenerationProcessor.name);
  private worker: Worker<SessionGenerationJob> | undefined;
  private connection: Redis | undefined;

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly context: TenantContext,
    private readonly analytics: AnalyticsService,
  ) {}

  onApplicationBootstrap(): void {
    this.connection = bullConnection(this.config);
    this.worker = new Worker<SessionGenerationJob>(
      SESSION_GENERATION_QUEUE,
      (job) => this.process(job),
      { connection: this.connection, concurrency: 1 },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.warn(
        { tenantId: job?.data.tenantId, err: err.message },
        'Session generation failed',
      ),
    );
  }

  async process(job: Job<SessionGenerationJob>): Promise<number> {
    const { tenantId, reason } = job.data;
    return this.context.run(tenantId, async () => {
      this.cls.set('actor', { type: 'SYSTEM' });
      return this.db.$transaction(async (tx) => {
        // Jobs re-check state (CLAUDE §9): an academy paused or closed since it was queued is skipped.
        const tenant = await tx.tenant.findFirst({ select: { status: true } });
        if (tenant?.status !== 'ACTIVE' && tenant?.status !== 'SETUP') return 0;
        const count = await generateSessions(tx, { tenantId });
        if (count > 0)
          await this.analytics.track(tx, 'session.generated', { source: reason, count });
        this.logger.log({ tenantId, count, reason }, 'Sessions generated');
        return count;
      });
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    this.connection?.disconnect();
  }
}
