import {
  localDate,
  newId,
  type OnlinePaymentStarted,
  type SimulateCheckout,
} from '@academybee/contracts';
import type { TenantBoundClient, TransactionClient } from '@academybee/database';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { AnalyticsService } from '../../core/analytics/analytics.service.js';
import { AuditService } from '../../core/audit/audit.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { RateLimiter } from '../../core/rate-limit/rate-limiter.service.js';
import { TenantContext } from '../../core/tenant/tenant-context.service.js';
import { balanceOf } from './domain/money.js';
import { nextPayment } from './domain/payment.state.js';
import { PaymentAccountsService } from './payment-accounts.service.js';
import { PaymentsService } from './payments.service.js';
import type { ProviderEvent } from './providers/payment-provider.js';
import { PaymentProviderRegistry } from './providers/provider-registry.js';
import { SimulatorProvider, SIMULATOR_SIGNATURE_HEADER } from './providers/simulator.provider.js';
import { ReconciliationService } from './reconciliation.service.js';

const WEBHOOK_RULE = { name: 'payment-webhook', limit: 300, windowSeconds: 60 } as const;
/** A checkout still in progress holds its invoice for this long, so a double tap can't pay twice. */
const IN_PROGRESS_MS = 15 * 60_000;
const NOT_STARTED = 'The gateway could not start this payment';
const rejected = () => new DomainError('UNAUTHENTICATED', 'webhook rejected');

/**
 * Paying online (ARCHITECTURE §12.3, G-01). The money goes to the academy's own account. The
 * browser is never believed: only a signature-checked webhook or a server-side status fetch can
 * confirm, both through `applyGatewayOutcome`, which is safe to reach any number of times.
 */
@Injectable()
export class OnlinePaymentsService {
  private readonly logger = new Logger(OnlinePaymentsService.name);

  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly context: TenantContext,
    private readonly rate: RateLimiter,
    private readonly accounts: PaymentAccountsService,
    private readonly registry: PaymentProviderRegistry,
    private readonly payments: PaymentsService,
    private readonly reconciliation: ReconciliationService,
    private readonly analytics: AnalyticsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * INITIATED is committed before the gateway is called, so an order can never exist without our
   * record of it; PENDING once the gateway has answered, FAILED if it refused. The caller has
   * already checked who is asking (the hub's rules).
   */
  async start(input: {
    invoiceId: string;
    amountMinor?: number | undefined;
    userId: string;
  }): Promise<OnlinePaymentStarted> {
    const account = await this.accounts.live();
    if (!account)
      throw new DomainError('CONFLICT', 'no gateway', [
        { path: 'gateway', issue: 'gateway_not_connected' },
      ]);
    const payment = await this.db.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: input.invoiceId },
        select: {
          tenantId: true,
          branchId: true,
          studentId: true,
          status: true,
          number: true,
          currency: true,
          totalMinor: true,
          paidMinor: true,
          creditAppliedMinor: true,
          writtenOffMinor: true,
        },
      });
      if (!invoice) throw new DomainError('NOT_FOUND', 'invoice');
      if (invoice.status !== 'ISSUED' && invoice.status !== 'PARTIALLY_PAID')
        throw new DomainError('CONFLICT', 'invoice not open', [
          { path: 'invoiceId', issue: 'invoice_not_open' },
        ]);
      const balance = balanceOf(invoice);
      const amountMinor = input.amountMinor ?? balance;
      if (amountMinor > balance || amountMinor <= 0)
        throw new DomainError('VALIDATION_FAILED', 'more than is owed', [
          { path: 'amountMinor', issue: 'exceeds_balance' },
        ]);
      const inProgress = await tx.payment.findFirst({
        where: {
          source: 'GATEWAY',
          status: { in: ['INITIATED', 'PENDING'] },
          allocateTo: { has: input.invoiceId },
          createdAt: { gt: new Date(Date.now() - IN_PROGRESS_MS) },
        },
        select: { id: true },
      });
      if (inProgress)
        throw new DomainError('CONFLICT', 'payment in progress', [
          { path: 'invoiceId', issue: 'payment_in_progress' },
        ]);
      const tenant = await tx.tenant.findFirst({ select: { timezone: true } });
      const today = localDate(new Date(), tenant?.timezone ?? 'Asia/Kolkata');
      const id = newId();
      await tx.payment.create({
        data: {
          id,
          tenantId: invoice.tenantId,
          branchId: invoice.branchId,
          studentId: invoice.studentId,
          method: 'ONLINE_GATEWAY',
          source: 'GATEWAY',
          status: 'INITIATED',
          amountMinor,
          currency: invoice.currency,
          paidOn: new Date(`${today}T00:00:00Z`),
          allocateTo: [input.invoiceId],
          reportedByUserId: input.userId,
          providerAccountId: account.id,
        },
      });
      await this.analytics.track(tx, 'payment.recorded', {
        method: 'ONLINE_GATEWAY',
        source: 'GATEWAY',
      });
      return { id, amountMinor, currency: invoice.currency, number: invoice.number ?? '' };
    });
    try {
      const credentials = await this.accounts.credentials(account.id);
      const order = await account.provider.createOrder(credentials, {
        paymentId: payment.id,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        description: payment.number,
      });
      await this.db.$transaction(async (tx) => {
        await this.payments.lockPayment(tx, payment.id);
        if (!nextPayment('INITIATED', 'order_created', 'PENDING'))
          throw new DomainError('INVALID_STATE_TRANSITION', 'payment');
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'PENDING', providerOrderId: order.orderId, version: { increment: 1 } },
        });
        await this.audit.record(
          {
            action: 'finance.payment_order_created',
            entityType: 'Payment',
            entityId: payment.id,
            before: { status: 'INITIATED' },
            after: { status: 'PENDING', provider: account.provider.key },
          },
          tx,
        );
      });
      return {
        paymentId: payment.id,
        status: 'PENDING',
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        provider: account.provider.key,
        checkout: order.checkout,
      };
    } catch (error) {
      this.logger.error({ paymentId: payment.id }, 'Gateway refused an order');
      await this.giveUp(payment.id);
      throw error instanceof DomainError
        ? error
        : new DomainError('SERVICE_UNAVAILABLE', 'gateway unavailable', [
            { path: 'gateway', issue: 'gateway_unavailable' },
          ]);
    }
  }

  /**
   * An order that never started: the gateway refused, or we died before saving its answer.
   * Nothing was applied, and with no order id no event can ever refer to it.
   */
  async giveUp(paymentId: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await this.payments.lockPayment(tx, paymentId);
      const moved = await tx.payment.updateMany({
        where: { id: paymentId, status: 'INITIATED' },
        data: { status: 'FAILED', rejectionReason: NOT_STARTED, version: { increment: 1 } },
      });
      if (moved.count === 1 && nextPayment('INITIATED', 'fail', 'FAILED'))
        await this.audit.record(
          {
            action: 'finance.payment_rejected',
            entityType: 'Payment',
            entityId: paymentId,
            before: { status: 'INITIATED' },
            after: { status: 'FAILED', method: 'ONLINE_GATEWAY' },
            metadata: { reason: NOT_STARTED },
          },
          tx,
        );
    });
  }

  /**
   * `POST /webhooks/payments/:provider/:accountRef` (ADR-033). The account says which academy; the
   * signature, checked with that account's own secret, says it really is the gateway. Everything
   * refused looks the same from outside (401) and is logged, without the body or signature. The
   * event row and its effects commit together, so a crash means the gateway's retry starts clean.
   */
  async receive(
    providerKey: string,
    accountRef: string,
    rawBody: unknown,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<{ received: true; duplicate: boolean }> {
    await this.rate.consume(WEBHOOK_RULE, String(this.cls.get('ip') ?? 'unknown'));
    const refuse = (reason: string) => {
      this.logger.warn({ provider: providerKey, reason }, 'payment.webhook.rejected');
      return rejected();
    };
    const bytes = rawBody instanceof Uint8Array ? rawBody : null;
    if (!bytes) throw refuse('no_body');
    const provider = this.registry.get(providerKey);
    if (!provider) throw refuse('provider_not_enabled');
    const found = await this.context.run(undefined, () =>
      this.db.$lookupPaymentAccount(accountRef),
    );
    if (found?.provider !== providerKey) throw refuse('unknown_account');
    return this.context.run(found.tenantId, async () => {
      this.cls.set('actor', { type: 'SYSTEM' });
      const account = await this.db.tenantPaymentAccount.findFirst({
        where: { accountRef },
        select: { id: true, tenantId: true, webhookCipher: true },
      });
      if (!account) throw refuse('unknown_account');
      const secret = this.accounts.webhookSecret(account.webhookCipher);
      const event = secret ? provider.verifyWebhook(secret, bytes, headers) : null;
      if (!event) throw refuse('bad_signature');
      const duplicate = await this.db.$transaction(async (tx) => {
        const stored = await tx.gatewayEvent.createMany({
          data: [
            {
              id: newId(),
              tenantId: account.tenantId,
              accountId: account.id,
              provider: providerKey,
              providerEventId: event.id,
              type: event.type,
              payload: { orderId: event.orderId, amountMinor: event.amountMinor },
            },
          ],
          skipDuplicates: true,
        });
        if (stored.count === 0) return true;
        const paymentId = await this.applyEvent(tx, account, event);
        await tx.gatewayEvent.update({
          where: {
            tenantId_provider_providerEventId: {
              tenantId: account.tenantId,
              provider: providerKey,
              providerEventId: event.id,
            },
          },
          data: { processedAt: new Date(), paymentId },
        });
        return false;
      });
      return { received: true as const, duplicate };
    });
  }

  private async applyEvent(
    tx: TransactionClient,
    account: { id: string; tenantId: string },
    event: ProviderEvent,
  ): Promise<string | null> {
    if (event.type === 'OTHER') return null;
    const found = await tx.payment.findFirst({
      where: { providerAccountId: account.id, providerOrderId: event.orderId, source: 'GATEWAY' },
      select: { id: true },
    });
    if (!found) {
      await this.reconciliation.record(tx, {
        tenantId: account.tenantId,
        accountId: account.id,
        kind: 'UNKNOWN_ORDER',
        reference: event.orderId,
        details: { amountMinor: event.amountMinor, event: event.type },
      });
      return null;
    }
    await this.applyGatewayOutcome(tx, found.id, account, {
      orderId: event.orderId,
      paid: event.type === 'PAID',
      providerPaymentId: event.providerPaymentId,
      amountMinor: event.amountMinor,
      reason: event.reason,
    });
    return found.id;
  }

  /**
   * What the gateway says about a payment, from a webhook or a status fetch. Under the payment's
   * lock only a PENDING payment moves, so replays and races end the same way. Money that doesn't
   * add up is never confirmed: a person looks at it.
   */
  async applyGatewayOutcome(
    tx: TransactionClient,
    paymentId: string,
    account: { id: string; tenantId: string },
    outcome: {
      orderId: string;
      paid: boolean;
      providerPaymentId: string | null;
      amountMinor: number | null;
      reason: string | null;
    },
  ): Promise<void> {
    await this.payments.lockPayment(tx, paymentId);
    const row = await tx.payment.findFirst({
      where: { id: paymentId },
      select: {
        id: true,
        tenantId: true,
        studentId: true,
        status: true,
        amountMinor: true,
        allocateTo: true,
      },
    });
    if (!row) return;
    const flag = (kind: 'AMOUNT_MISMATCH' | 'PAID_AFTER_FAILED') =>
      this.reconciliation.record(tx, {
        tenantId: account.tenantId,
        accountId: account.id,
        paymentId,
        kind,
        reference: outcome.orderId,
        details: { ours: row.amountMinor, theirs: outcome.amountMinor, status: row.status },
      });
    if (!outcome.paid) {
      if (row.status === 'PENDING')
        await this.payments.failFromGateway(tx, row, outcome.reason ?? 'The payment failed');
      return;
    }
    if (outcome.amountMinor !== row.amountMinor) return void (await flag('AMOUNT_MISMATCH'));
    if (row.status === 'FAILED') return void (await flag('PAID_AFTER_FAILED'));
    if (row.status === 'PENDING')
      await this.payments.confirmFromGateway(tx, row, outcome.providerPaymentId);
  }

  /**
   * The simulator's checkout finishing (never in production). It goes through `receive` with real
   * signed bytes, so the whole pipeline runs; `NONE` is a webhook that never arrives.
   */
  async simulateCheckout(paymentId: string, input: SimulateCheckout): Promise<void> {
    const sim: SimulatorProvider | undefined = this.registry.simulator;
    if (!sim) throw new DomainError('NOT_FOUND', 'simulator not enabled');
    const row = await this.db.payment.findFirst({
      where: { id: paymentId, source: 'GATEWAY' },
      select: { providerOrderId: true, providerAccountId: true },
    });
    if (!row?.providerOrderId || !row.providerAccountId)
      throw new DomainError('NOT_FOUND', 'payment');
    const account = await this.db.tenantPaymentAccount.findFirst({
      where: { id: row.providerAccountId, provider: 'simulator' },
      select: { accountRef: true, webhookCipher: true },
    });
    if (!account) throw new DomainError('NOT_FOUND', 'payment');
    const event = await sim.complete(row.providerOrderId, input.outcome);
    if (!event) throw new DomainError('NOT_FOUND', 'payment');
    const times = { ONCE: 1, TWICE: 2, NONE: 0 }[input.delivery];
    const secret = this.accounts.webhookSecret(account.webhookCipher);
    if (!secret) throw new DomainError('INTERNAL', 'simulator secret');
    const body = Buffer.from(JSON.stringify(event));
    const headers = { [SIMULATOR_SIGNATURE_HEADER]: SimulatorProvider.sign(secret, body) };
    // `receive` starts from no academy, as a real delivery does.
    for (let i = 0; i < times; i++)
      await this.receive('simulator', account.accountRef, body, headers);
  }
}
