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
import { OnlinePaymentsService } from './online-payments.service.js';
import { PaymentAccountsService } from './payment-accounts.service.js';
import type { ProviderSettlement } from './providers/payment-provider.js';
import { PaymentProviderRegistry } from './providers/provider-registry.js';
import { RECONCILIATION_QUEUE, type ReconciliationJob } from './reconciliation.queue.js';
import { ReconciliationService } from './reconciliation.service.js';

/** A webhook gets this long to arrive before the gateway is asked directly. */
const ASK_AFTER_MS = 15 * 60_000;
const STUCK_AFTER_MS = 24 * 3_600_000;
const SETTLEMENT_WINDOW_MS = 7 * 86_400_000;

/**
 * One academy's hourly check (§12.3), for each of its accounts, disabled ones too: their orders
 * may still settle. Asks the gateway about payments no webhook has decided (a server-side status
 * fetch may confirm, §12.1), then compares settlements with our confirmed payments. Safe to run
 * twice. Each payment has its own transaction, so one bad answer doesn't stop the rest.
 */
@Injectable()
export class ReconciliationProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ReconciliationProcessor.name);
  private worker: Worker<ReconciliationJob> | undefined;
  private connection: Redis | undefined;

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly context: TenantContext,
    private readonly registry: PaymentProviderRegistry,
    private readonly accounts: PaymentAccountsService,
    private readonly online: OnlinePaymentsService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  onApplicationBootstrap(): void {
    this.connection = bullConnection(this.config);
    this.worker = new Worker<ReconciliationJob>(RECONCILIATION_QUEUE, (job) => this.process(job), {
      connection: this.connection,
      concurrency: 1,
    });
    this.worker.on('failed', (job, err) =>
      this.logger.warn({ tenantId: job?.data.tenantId, err: err.message }, 'Reconciliation failed'),
    );
  }

  async process(
    job: Pick<Job<ReconciliationJob>, 'data'>,
    now = new Date(),
  ): Promise<{ asked: number; settlements: number }> {
    return this.context.run(job.data.tenantId, async () => {
      this.cls.set('actor', { type: 'SYSTEM' });
      const accounts = await this.db.tenantPaymentAccount.findMany({
        select: { id: true, tenantId: true, provider: true, accountRef: true },
      });
      let asked = 0;
      let settlements = 0;
      for (const account of accounts) {
        const provider = this.registry.get(account.provider);
        if (!provider?.online) continue;
        let credentials;
        try {
          credentials = await this.accounts.credentials(account.id);
        } catch {
          this.logger.warn({ accountId: account.id }, 'Account credentials unreadable');
          continue;
        }
        // Died between saving our record and saving the gateway's answer.
        const unstarted = await this.db.payment.findMany({
          where: {
            providerAccountId: account.id,
            source: 'GATEWAY',
            status: 'INITIATED',
            createdAt: { lt: new Date(now.getTime() - ASK_AFTER_MS) },
          },
          take: 500,
          select: { id: true },
        });
        for (const p of unstarted) await this.online.giveUp(p.id);
        const waiting = await this.db.payment.findMany({
          where: {
            providerAccountId: account.id,
            source: 'GATEWAY',
            status: 'PENDING',
            createdAt: { lt: new Date(now.getTime() - ASK_AFTER_MS) },
          },
          take: 500,
          select: { id: true, providerOrderId: true, createdAt: true, amountMinor: true },
        });
        for (const p of waiting) {
          if (!p.providerOrderId) continue;
          asked += 1;
          const orderId = p.providerOrderId;
          let answer;
          try {
            answer = await provider.fetchStatus(credentials, orderId);
          } catch {
            this.logger.warn({ paymentId: p.id }, 'Gateway status fetch failed');
            continue;
          }
          const status = answer;
          await this.db.$transaction(async (tx) => {
            if (status.status === 'PAID' || status.status === 'FAILED')
              return this.online.applyGatewayOutcome(tx, p.id, account, {
                orderId,
                paid: status.status === 'PAID',
                providerPaymentId: status.providerPaymentId,
                amountMinor: status.amountMinor,
                reason: status.reason,
              });
            if (now.getTime() - p.createdAt.getTime() > STUCK_AFTER_MS)
              await this.reconciliation.record(tx, {
                tenantId: account.tenantId,
                accountId: account.id,
                paymentId: p.id,
                kind: 'STUCK_PENDING',
                reference: orderId,
                details: { ours: p.amountMinor, theirs: status.amountMinor, status: status.status },
              });
          });
        }
        let lines: ProviderSettlement[];
        try {
          lines = await provider.fetchSettlements(
            credentials,
            new Date(now.getTime() - SETTLEMENT_WINDOW_MS),
          );
        } catch {
          this.logger.warn({ accountId: account.id }, 'Gateway settlement fetch failed');
          continue;
        }
        settlements += lines.length;
        for (const line of lines) {
          const ours = await this.db.payment.findFirst({
            where: { providerAccountId: account.id, providerOrderId: line.orderId },
            select: { id: true, status: true, amountMinor: true },
          });
          const fine =
            ours?.amountMinor === line.amountMinor &&
            ['CONFIRMED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(ours.status);
          if (!fine)
            await this.db.$transaction((tx) =>
              this.reconciliation.record(tx, {
                tenantId: account.tenantId,
                accountId: account.id,
                ...(ours ? { paymentId: ours.id } : {}),
                kind: 'SETTLEMENT_MISMATCH',
                reference: line.reference,
                details: {
                  ours: ours?.amountMinor ?? null,
                  theirs: line.amountMinor,
                  status: ours?.status ?? null,
                },
              }),
            );
        }
      }
      return { asked, settlements };
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    this.connection?.disconnect();
  }
}
