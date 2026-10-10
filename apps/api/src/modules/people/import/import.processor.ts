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

import { MembershipService } from '../../../core/auth/membership.service.js';
import { API_CONFIG } from '../../../core/config/config.module.js';
import type { ApiConfig } from '../../../core/config/config.schema.js';
import type { RequestContext } from '../../../core/context/request-context.js';
import { TenantContext } from '../../../core/tenant/tenant-context.service.js';
import { bullConnection, IMPORT_QUEUE, type ImportJobData } from './import.queue.js';
import { ImportService } from './import.service.js';

/**
 * Runs import steps in the API process (C-100), one at a time per instance. Each job
 * re-establishes the academy's context and the starter's membership, and stops if they may no
 * longer import (removed, disabled, or the capability taken away) — CLAUDE §9.
 */
@Injectable()
export class ImportProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ImportProcessor.name);
  private worker: Worker<ImportJobData> | undefined;
  private connection: Redis | undefined;

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly cls: ClsService<RequestContext>,
    private readonly context: TenantContext,
    private readonly memberships: MembershipService,
    private readonly imports: ImportService,
  ) {}

  onApplicationBootstrap(): void {
    this.connection = bullConnection(this.config);
    this.worker = new Worker<ImportJobData>(IMPORT_QUEUE, (job) => this.process(job), {
      connection: this.connection,
      concurrency: 1,
    });
    this.worker.on('failed', (job, err) =>
      this.logger.warn({ jobId: job?.data.jobId, err: err.message }, 'Import step failed'),
    );
  }

  async process(job: Job<ImportJobData>): Promise<void> {
    const { tenantId, userId, jobId, action } = job.data;
    await this.context.run(tenantId, async () => {
      const membership = await this.memberships.load(tenantId, userId);
      if (
        !membership ||
        membership.status !== 'ACTIVE' ||
        !membership.capabilities['student.import']
      ) {
        this.logger.warn({ jobId }, 'Import starter may no longer import; step skipped');
        return;
      }
      this.cls.set('membership', membership);
      this.cls.set('userId', userId);
      this.cls.set('actor', { type: 'USER', id: userId });
      if (action === 'parse') await this.imports.processParse(jobId);
      else await this.imports.processCommit(jobId);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    this.connection?.disconnect();
  }
}
