import { localDate } from '@academybee/contracts';
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
import { FINANCE_DAILY_QUEUE, type FinanceDailyJob } from './finance-daily.queue.js';
import { InvoiceGenerationService } from './invoice-generation.service.js';
import { InvoicesService } from './invoices.service.js';

/**
 * One academy's nightly finance run, in the API process with its tenant context; the academy
 * must still be active (CLAUDE §9: jobs re-check state). Overdue marking, then billing the cycles
 * that are due; both are safe to run twice.
 */
@Injectable()
export class FinanceDailyProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(FinanceDailyProcessor.name);
  private worker: Worker<FinanceDailyJob> | undefined;
  private connection: Redis | undefined;

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly context: TenantContext,
    private readonly invoices: InvoicesService,
    private readonly generation: InvoiceGenerationService,
  ) {}

  onApplicationBootstrap(): void {
    this.connection = bullConnection(this.config);
    this.worker = new Worker<FinanceDailyJob>(FINANCE_DAILY_QUEUE, (job) => this.process(job), {
      connection: this.connection,
      concurrency: 1,
    });
    this.worker.on('failed', (job, err) =>
      this.logger.warn({ tenantId: job?.data.tenantId, err: err.message }, 'Finance run failed'),
    );
  }

  async process(
    job: Job<FinanceDailyJob>,
    now = new Date(),
  ): Promise<{ overdue: number; generated: number; failed: number }> {
    const { tenantId } = job.data;
    return this.context.run(tenantId, async () => {
      this.cls.set('actor', { type: 'SYSTEM' });
      const today = await this.db.$transaction(async (tx) => {
        const tenant = await tx.tenant.findFirst({ select: { status: true, timezone: true } });
        return tenant?.status === 'ACTIVE' ? localDate(now, tenant.timezone) : null;
      });
      if (!today) return { overdue: 0, generated: 0, failed: 0 };
      const { generated, failed } = await this.generation.run(today);
      const overdue = await this.db.$transaction((tx) => this.invoices.markOverdue(tx, today));
      if (overdue) this.logger.log({ tenantId, overdue }, 'Invoices marked overdue');
      if (failed) this.logger.warn({ tenantId, failed }, 'Some fee assignments were not billed');
      return { overdue, generated, failed };
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    this.connection?.disconnect();
  }
}
