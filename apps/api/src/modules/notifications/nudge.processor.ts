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

import { API_CONFIG } from '../../core/config/config.module.js';
import type { ApiConfig } from '../../core/config/config.schema.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { bullConnection } from '../../core/redis/bull-connection.js';
import { TenantContext } from '../../core/tenant/tenant-context.service.js';
import { NotificationsService } from './notifications.service.js';
import { ATTENDANCE_NUDGE_QUEUE, type AttendanceNudgeJob } from './nudge.queue.js';

/**
 * One academy's attendance nudges (G-16), in the API process with its tenant context; the
 * academy must still be open (CLAUDE §9: jobs re-check state).
 */
@Injectable()
export class AttendanceNudgeProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AttendanceNudgeProcessor.name);
  private worker: Worker<AttendanceNudgeJob> | undefined;
  private connection: Redis | undefined;

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly context: TenantContext,
    private readonly notifications: NotificationsService,
  ) {}

  onApplicationBootstrap(): void {
    this.connection = bullConnection(this.config);
    this.worker = new Worker<AttendanceNudgeJob>(
      ATTENDANCE_NUDGE_QUEUE,
      (job) => this.process(job),
      {
        connection: this.connection,
        concurrency: 1,
      },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.warn(
        { tenantId: job?.data.tenantId, err: err.message },
        'Attendance nudge failed',
      ),
    );
  }

  async process(job: Job<AttendanceNudgeJob>, now = new Date()): Promise<number> {
    const { tenantId } = job.data;
    return this.context.run(tenantId, async () => {
      this.cls.set('actor', { type: 'SYSTEM' });
      return this.db.$transaction(async (tx) => {
        const tenant = await tx.tenant.findFirst({ select: { status: true } });
        if (tenant?.status !== 'ACTIVE') return 0;
        const count = await this.notifications.nudge(tx, now);
        if (count) this.logger.log({ tenantId, count }, 'Attendance nudges sent');
        return count;
      });
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    this.connection?.disconnect();
  }
}
