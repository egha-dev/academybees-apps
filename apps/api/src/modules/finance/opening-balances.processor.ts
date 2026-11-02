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

import { MembershipService } from '../../core/auth/membership.service.js';
import { API_CONFIG } from '../../core/config/config.module.js';
import type { ApiConfig } from '../../core/config/config.schema.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { bullConnection } from '../../core/redis/bull-connection.js';
import { TenantContext } from '../../core/tenant/tenant-context.service.js';
import { OPENING_BALANCES_QUEUE, type OpeningBalancesJob } from './opening-balances.queue.js';
import { OpeningBalancesService } from './opening-balances.service.js';

/**
 * Runs opening-balance import steps in the API process, one at a time (C-100). Each re-establishes
 * the academy and the starter's membership, and stops if they may no longer create invoices.
 */
@Injectable()
export class OpeningBalancesProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OpeningBalancesProcessor.name);
  private worker: Worker<OpeningBalancesJob> | undefined;
  private connection: Redis | undefined;

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly cls: ClsService<RequestContext>,
    private readonly context: TenantContext,
    private readonly memberships: MembershipService,
    private readonly balances: OpeningBalancesService,
  ) {}

  onApplicationBootstrap(): void {
    this.connection = bullConnection(this.config);
    this.worker = new Worker<OpeningBalancesJob>(
      OPENING_BALANCES_QUEUE,
      (job) => this.process(job),
      { connection: this.connection, concurrency: 1 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.warn(
        { jobId: job?.data.jobId, err: err.message },
        'Opening balances step failed',
      );
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1))
        void this.context
          .run(job.data.tenantId, () => this.balances.markFailed(job.data.jobId, 'internal'))
          .catch((e: unknown) =>
            this.logger.error({ jobId: job.data.jobId, err: e }, 'Could not be marked failed'),
          );
    });
  }

  async process(job: Job<OpeningBalancesJob>): Promise<void> {
    const { tenantId, userId, jobId, action } = job.data;
    await this.context.run(tenantId, async () => {
      const membership = await this.memberships.load(tenantId, userId);
      if (
        !membership ||
        membership.status !== 'ACTIVE' ||
        !membership.capabilities['invoice.create']
      ) {
        await this.balances.markFailed(jobId, 'not_allowed');
        return;
      }
      this.cls.set('membership', membership);
      this.cls.set('userId', userId);
      this.cls.set('actor', { type: 'USER', id: userId });
      if (action === 'parse') await this.balances.processParse(jobId);
      else await this.balances.processCommit(jobId);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    this.connection?.disconnect();
  }
}
