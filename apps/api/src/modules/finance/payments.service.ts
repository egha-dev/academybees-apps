import {
  addDays,
  decodeCursor,
  encodeCursor,
  localDate,
  newId,
  type Payment,
  type PaymentSummary,
  type RecordCashPayment,
  type RecordPayment,
  type RefundPayment,
  type RejectPayment,
} from '@academybee/contracts';
import type { Prisma, TenantBoundClient, TransactionClient } from '@academybee/database';
import { createServerTranslator } from '@academybee/i18n';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';

import { AnalyticsService } from '../../core/analytics/analytics.service.js';
import { AuditService } from '../../core/audit/audit.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { MediaStorage } from '../../core/media/media-storage.js';
import { assertInScope, scopedWhere } from '../../core/rbac/scope.js';
import { StudentsService } from '../people/index.js';
import { nextInvoice, settledStatus } from './domain/invoice.state.js';
import { allocate, balanceOf, refundSources } from './domain/money.js';
import {
  afterRefund,
  initialStatus,
  nextPayment,
  type PaymentStatus,
} from './domain/payment.state.js';
import { invoicePolicy, paymentPolicy } from './finance.policy.js';
import { FinanceSettingsService } from './finance-settings.service.js';
import { nextNumber } from './invoice-numbers.js';
import { InvoicesService } from './invoices.service.js';

const at = (d: string) => new Date(`${d}T00:00:00Z`);
const day = (d: Date) => d.toISOString().slice(0, 10);
const LINK_SECONDS = 300;

const SUMMARY = {
  id: true,
  tenantId: true,
  branchId: true,
  studentId: true,
  student: { select: { fullName: true } },
  method: true,
  source: true,
  status: true,
  amountMinor: true,
  refundedMinor: true,
  currency: true,
  reference: true,
  chequeBank: true,
  chequeDate: true,
  paidOn: true,
  receiptNumber: true,
  duplicateFlag: true,
  evidenceKey: true,
  allocateTo: true,
  note: true,
  rejectionReason: true,
  confirmedAt: true,
  createdAt: true,
  version: true,
} satisfies Prisma.PaymentSelect;

type Row = Prisma.PaymentGetPayload<{ select: typeof SUMMARY }>;

const toSummary = (r: Row): PaymentSummary => ({
  id: r.id,
  studentId: r.studentId,
  studentName: r.student.fullName,
  method: r.method,
  source: r.source,
  status: r.status,
  amountMinor: r.amountMinor,
  refundedMinor: r.refundedMinor,
  currency: r.currency,
  reference: r.reference,
  chequeBank: r.chequeBank,
  chequeDate: r.chequeDate ? day(r.chequeDate) : null,
  paidOn: day(r.paidOn),
  receiptNumber: r.receiptNumber,
  duplicateFlag: r.duplicateFlag,
  hasEvidence: r.evidenceKey !== null,
  invoiceIds: r.allocateTo,
  note: r.note,
  rejectionReason: r.rejectionReason,
  confirmedAt: r.confirmedAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
  version: r.version,
});

/** A row locked for a money change: read after the lock, so balances are the committed ones. */
type LockedInvoice = {
  id: string;
  status: 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'WRITTEN_OFF' | 'CANCELLED' | 'DRAFT';
  due_date: Date;
  total_minor: number;
  paid_minor: number;
  credit_applied_minor: number;
  written_off_minor: number;
};
const balanceOfLocked = (i: LockedInvoice) =>
  balanceOf({
    totalMinor: i.total_minor,
    paidMinor: i.paid_minor,
    creditAppliedMinor: i.credit_applied_minor,
    writtenOffMinor: i.written_off_minor,
  });

export type NewPayment = {
  tenantId: string;
  branchId: string;
  studentId: string;
  method: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD_POS';
  source: 'STAFF_RECORDED' | 'PARENT_REPORTED';
  amountMinor: number;
  reference?: string | undefined;
  chequeBank?: string | undefined;
  chequeDate?: string | undefined;
  paidOn: string;
  invoiceIds: string[];
  note?: string | undefined;
  recordedById: string | null;
  reportedByUserId: string | null;
};

/**
 * Money received (ARCHITECTURE §12.1, ADR-038, C-150). Staff-recorded cash, UPI, bank and card are
 * confirmed by the server on acceptance; cheques and anything a parent reports wait as PENDING
 * for `payment.verify`. Confirmation is one code path: it locks the invoices, applies the money,
 * puts anything left in the student's credit, then takes the receipt number last, so a number is
 * held for as short a time as possible and never issued to anything unconfirmed.
 *
 * Lock order, everywhere: payment → invoices (by id) → the student's credit → receipt number.
 */
@Injectable()
export class PaymentsService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
    private readonly settings: FinanceSettingsService,
    private readonly invoices: InvoicesService,
    private readonly students: StudentsService,
    private readonly storage: MediaStorage,
  ) {}

  private scope(
    capability: 'payment.read' | 'payment.verify' | 'payment.refund',
  ): Prisma.PaymentWhereInput {
    return scopedWhere(this.cls, capability, paymentPolicy);
  }

  private membershipId(): string {
    return this.cls.get('membership')!.id;
  }

  private async today(db: Pick<TransactionClient, 'tenant'>): Promise<string> {
    const t = await db.tenant.findFirst({ select: { timezone: true } });
    return localDate(new Date(), t?.timezone ?? 'Asia/Kolkata');
  }

  private notInStatus(status: string): DomainError {
    return new DomainError('INVALID_STATE_TRANSITION', `payment ${status}`, [
      { path: 'status', issue: status.toLowerCase() },
    ]);
  }

  async list(query: {
    status?: string | undefined;
    studentId?: string | undefined;
    method?: string | undefined;
    source?: string | undefined;
    cursor?: string | undefined;
    limit: number;
  }) {
    const after = query.cursor ? decodeCursor(query.cursor, z.object({ id: z.uuid() })) : null;
    if (query.cursor && !after)
      throw new DomainError('VALIDATION_FAILED', 'bad cursor', [
        { path: 'cursor', issue: 'invalid' },
      ]);
    // The Verify queue is worked oldest first; history reads newest first.
    const queue = query.status === 'PENDING';
    const rows = await this.db.payment.findMany({
      where: {
        AND: [
          this.scope('payment.read'),
          query.status ? ({ status: query.status } as Prisma.PaymentWhereInput) : {},
          query.studentId ? { studentId: query.studentId } : {},
          query.method ? ({ method: query.method } as Prisma.PaymentWhereInput) : {},
          query.source ? ({ source: query.source } as Prisma.PaymentWhereInput) : {},
          after ? { id: queue ? { gt: after.id } : { lt: after.id } } : {},
        ],
      },
      orderBy: { id: queue ? 'asc' : 'desc' },
      take: query.limit + 1,
      select: SUMMARY,
    });
    const page = rows.slice(0, query.limit);
    return {
      items: page.map(toSummary),
      nextCursor:
        rows.length > query.limit ? encodeCursor({ id: page[page.length - 1]!.id }) : null,
    };
  }

  async get(id: string): Promise<Payment> {
    const row = await this.db.payment.findFirst({
      where: { AND: [{ id }, this.scope('payment.read')] },
      select: {
        ...SUMMARY,
        allocations: {
          select: { invoiceId: true, amountMinor: true, invoice: { select: { number: true } } },
        },
        credits: { select: { amountMinor: true } },
        refunds: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            amountMinor: true,
            method: true,
            reference: true,
            reason: true,
            refundedOn: true,
          },
        },
      },
    });
    if (!row) throw new DomainError('NOT_FOUND', 'payment');
    const net = new Map<string, { number: string | null; amountMinor: number }>();
    for (const a of row.allocations) {
      const seen = net.get(a.invoiceId);
      net.set(a.invoiceId, {
        number: a.invoice.number,
        amountMinor: (seen?.amountMinor ?? 0) + a.amountMinor,
      });
    }
    return {
      ...toSummary(row),
      allocations: [...net.entries()]
        .filter(([, v]) => v.amountMinor > 0)
        .map(([invoiceId, v]) => ({
          invoiceId,
          invoiceNumber: v.number,
          amountMinor: v.amountMinor,
        })),
      creditMinor: row.credits.reduce((sum, c) => sum + c.amountMinor, 0),
      refunds: row.refunds.map((r) => ({
        id: r.id,
        amountMinor: r.amountMinor,
        method: r.method,
        reference: r.reference,
        reason: r.reason,
        refundedOn: day(r.refundedOn),
      })),
    };
  }

  /** `payment.record_cash`: the route's capability; the student must be in that scope too. */
  recordCash(input: RecordCashPayment): Promise<Payment> {
    return this.recordByStaff({ ...input, method: 'CASH' }, 'payment.record_cash');
  }

  /** `payment.record_offline`: UPI, bank, card and cheques. */
  record(input: RecordPayment): Promise<Payment> {
    return this.recordByStaff(input, 'payment.record_offline');
  }

  private async recordByStaff(
    input: RecordCashPayment & {
      method: NewPayment['method'];
      reference?: string;
      chequeBank?: string | undefined;
      chequeDate?: string | undefined;
    },
    capability: 'payment.record_cash' | 'payment.record_offline',
  ): Promise<Payment> {
    const recordedById = this.membershipId();
    const id = await this.withReferenceCheck(input.method, input.reference, () =>
      this.db.$transaction(async (tx) => {
        const [student] = await this.students.forFees(tx, [input.studentId]);
        assertInScope(this.cls, capability, paymentPolicy, { branchId: student!.branchId });
        const today = await this.today(tx);
        return this.recordIn(tx, {
          tenantId: this.cls.get('tenantId'),
          branchId: student!.branchId,
          studentId: input.studentId,
          method: input.method,
          source: 'STAFF_RECORDED',
          amountMinor: input.amountMinor,
          reference: input.reference,
          chequeBank: input.chequeBank,
          chequeDate: input.chequeDate,
          paidOn: input.paidOn ?? today,
          invoiceIds: input.invoiceIds ?? [],
          note: input.note,
          recordedById,
          reportedByUserId: null,
        });
      }),
    );
    return this.get(id);
  }

  /**
   * Create a payment in the caller's transaction, for staff and the parent's report alike. The
   * status comes from `initialStatus` — nothing a client sends can make a payment CONFIRMED.
   * `needsReview` marks left-over credit for an accountant's look (offline cash, C-146).
   */
  async recordIn(
    tx: TransactionClient,
    input: NewPayment,
    options: { clientRef?: string; needsReview?: boolean } = {},
  ): Promise<string> {
    const { settings } = await this.settings.current(tx);
    if (!settings.methods[input.method])
      throw new DomainError('CONFLICT', 'method switched off', [
        { path: 'method', issue: 'method_disabled' },
      ]);
    if (input.paidOn > (await this.today(tx)))
      throw new DomainError('VALIDATION_FAILED', 'paid in the future', [
        { path: 'paidOn', issue: 'future_date' },
      ]);
    await this.assertPayable(tx, input.studentId, input.invoiceIds);
    const status = initialStatus(input.source, input.method);
    const id = newId();
    await tx.payment.create({
      data: {
        id,
        tenantId: input.tenantId,
        branchId: input.branchId,
        studentId: input.studentId,
        method: input.method,
        source: input.source,
        status,
        amountMinor: input.amountMinor,
        reference: input.reference ?? null,
        chequeBank: input.chequeBank ?? null,
        chequeDate: input.chequeDate ? at(input.chequeDate) : null,
        paidOn: at(input.paidOn),
        allocateTo: input.invoiceIds,
        note: input.note ?? null,
        clientRef: options.clientRef ?? null,
        duplicateFlag: await this.usedByAnotherMethod(tx, input.method, input.reference),
        recordedById: input.recordedById,
        reportedByUserId: input.reportedByUserId,
        confirmedAt: status === 'CONFIRMED' ? new Date() : null,
      },
    });
    const applied =
      status === 'CONFIRMED'
        ? await this.applyAndNumber(tx, {
            id,
            tenantId: input.tenantId,
            studentId: input.studentId,
            amountMinor: input.amountMinor,
            allocateTo: input.invoiceIds,
            needsReview: options.needsReview ?? false,
            actorId: input.recordedById,
          })
        : null;
    await this.audit.record(
      {
        action: 'finance.payment_recorded',
        entityType: 'Payment',
        entityId: id,
        ...(input.reportedByUserId
          ? { actor: { type: 'USER' as const, id: input.reportedByUserId } }
          : {}),
        after: {
          method: input.method,
          source: input.source,
          status,
          amountMinor: input.amountMinor,
          reference: input.reference ?? null,
          ...applied,
        },
      },
      tx,
    );
    await this.analytics.track(tx, 'payment.recorded', {
      method: input.method,
      source: input.source,
    });
    return id;
  }

  /** Chosen invoices must be this student's and open, or the caller is told before any money moves. */
  private async assertPayable(tx: TransactionClient, studentId: string, invoiceIds: string[]) {
    if (!invoiceIds.length) return;
    const rows = await tx.invoice.findMany({
      where: { id: { in: invoiceIds }, studentId, status: { not: 'DRAFT' } },
      select: { id: true, status: true },
    });
    if (rows.length !== new Set(invoiceIds).size) throw new DomainError('NOT_FOUND', 'invoice');
    const closed = rows.find((r) => r.status !== 'ISSUED' && r.status !== 'PARTIALLY_PAID');
    if (closed)
      throw new DomainError('CONFLICT', 'invoice not open', [
        { path: `invoiceIds.${closed.id}`, issue: 'invoice_not_open' },
      ]);
  }

  /** ADR-038's soft warning: the same reference on a live payment of another method. */
  private async usedByAnotherMethod(
    tx: TransactionClient,
    method: NewPayment['method'],
    reference: string | undefined,
  ): Promise<boolean> {
    if (!reference) return false;
    const other = await tx.payment.findFirst({
      where: { reference, method: { not: method }, status: { not: 'FAILED' } },
      select: { id: true },
    });
    return other !== null;
  }

  /**
   * The same reference twice for a method is refused by a unique index, which also settles a race
   * between two requests (ADR-038). The transaction rolls back; the caller gets a plain 409.
   */
  async withReferenceCheck<T>(
    method: string,
    reference: string | undefined,
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002' || !reference) throw error;
      const live = await this.db.payment.findFirst({
        where: {
          reference,
          method: method as 'UPI',
          status: { not: 'FAILED' },
        },
        select: { id: true },
      });
      if (!live) throw error;
      throw new DomainError('CONFLICT', 'reference already used', [
        { path: 'reference', issue: 'duplicate_reference' },
      ]);
    }
  }

  /**
   * Apply a confirmed payment (§12.1): lock the chosen invoices (or all the student's open ones,
   * oldest due first), spread it over their balances, put what is left in the student's credit,
   * and take the receipt number last. A chosen invoice closed since then is passed over, so the
   * money becomes credit rather than disappearing.
   */
  private async applyAndNumber(
    tx: TransactionClient,
    p: {
      id: string;
      tenantId: string;
      studentId: string;
      amountMinor: number;
      allocateTo: string[];
      needsReview: boolean;
      actorId: string | null;
    },
  ): Promise<{ receiptNumber: string; allocatedMinor: number; creditMinor: number }> {
    const locked = await this.lockOpenInvoices(tx, p.studentId, p.allocateTo);
    const chosen = new Map(p.allocateTo.map((id, i) => [id, i]));
    const order = [...locked].sort((x, y) =>
      p.allocateTo.length
        ? chosen.get(x.id)! - chosen.get(y.id)!
        : x.due_date.getTime() - y.due_date.getTime() || x.id.localeCompare(y.id),
    );
    const { allocations, leftoverMinor } = allocate(
      p.amountMinor,
      order.map((i) => ({ id: i.id, balanceMinor: balanceOfLocked(i) })),
    );
    for (const a of allocations) {
      const inv = locked.find((i) => i.id === a.invoiceId)!;
      await tx.paymentAllocation.create({
        data: {
          id: newId(),
          tenantId: p.tenantId,
          paymentId: p.id,
          invoiceId: a.invoiceId,
          amountMinor: a.amountMinor,
        },
      });
      await this.settleInvoice(tx, inv, inv.paid_minor + a.amountMinor);
    }
    if (leftoverMinor > 0)
      await this.invoices.addCredit(tx, {
        tenantId: p.tenantId,
        studentId: p.studentId,
        amountMinor: leftoverMinor,
        kind: 'OVERPAYMENT',
        paymentId: p.id,
        needsReview: p.needsReview,
        createdById: p.actorId,
      });
    const { settings } = await this.settings.current(tx);
    const receiptNumber = await nextNumber(tx, {
      tenantId: p.tenantId,
      kind: 'RECEIPT',
      localDate: await this.today(tx),
      prefix: settings.prefixes.RECEIPT,
    });
    await tx.payment.update({ where: { id: p.id }, data: { receiptNumber } });
    return {
      receiptNumber,
      allocatedMinor: p.amountMinor - leftoverMinor,
      creditMinor: leftoverMinor,
    };
  }

  /**
   * `FOR UPDATE` re-reads each row after any wait, so a request that queued behind another sees
   * the balance that one left — this is what makes concurrent collects unable to over-allocate.
   */
  private lockOpenInvoices(tx: TransactionClient, studentId: string, only: string[]) {
    return tx.$queryRaw<LockedInvoice[]>`
      SELECT id, status, due_date, total_minor, paid_minor, credit_applied_minor, written_off_minor
        FROM invoice
       WHERE student_id = ${studentId}::uuid AND status IN ('ISSUED', 'PARTIALLY_PAID')
         AND (${only.length === 0} OR id = ANY(${only}::uuid[]))
       ORDER BY id FOR UPDATE`;
  }

  /** Move a locked invoice's paid total; its status follows the amounts (§12.1). */
  private async settleInvoice(tx: TransactionClient, inv: LockedInvoice, paidMinor: number) {
    // A closed invoice stays closed; what a refund gave back on it stays written off (C-150).
    if (inv.status === 'WRITTEN_OFF') {
      await tx.invoice.update({
        where: { id: inv.id },
        data: {
          paidMinor,
          writtenOffMinor: inv.written_off_minor + inv.paid_minor - paidMinor,
          version: { increment: 1 },
        },
      });
      return;
    }
    const status = settledStatus({
      totalMinor: inv.total_minor,
      paidMinor,
      creditAppliedMinor: inv.credit_applied_minor,
    });
    if (inv.status !== status && !nextInvoice(inv.status, 'settle', status))
      throw new DomainError('INVALID_STATE_TRANSITION', `invoice ${inv.status}`);
    await tx.invoice.update({
      where: { id: inv.id },
      data: {
        paidMinor,
        status,
        ...(status === 'PAID' ? { overdueSince: null } : {}),
        version: { increment: 1 },
      },
    });
  }

  /**
   * A gateway said this payment succeeded (a verified webhook or a status fetch, §12.3). The
   * caller holds the payment's lock and has read its status. No staff member is involved, so
   * nothing here reads a membership.
   */
  async confirmFromGateway(
    tx: TransactionClient,
    p: {
      id: string;
      tenantId: string;
      studentId: string;
      status: PaymentStatus;
      amountMinor: number;
      allocateTo: string[];
    },
    providerPaymentId: string | null,
  ): Promise<void> {
    if (!nextPayment(p.status, 'confirm', 'CONFIRMED')) throw this.notInStatus(p.status);
    await tx.payment.update({
      where: { id: p.id },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        reference: providerPaymentId,
        version: { increment: 1 },
      },
    });
    const applied = await this.applyAndNumber(tx, {
      id: p.id,
      tenantId: p.tenantId,
      studentId: p.studentId,
      amountMinor: p.amountMinor,
      allocateTo: p.allocateTo,
      needsReview: false,
      actorId: null,
    });
    await this.audit.record(
      {
        action: 'finance.payment_confirmed',
        entityType: 'Payment',
        entityId: p.id,
        before: { status: 'PENDING' },
        after: { status: 'CONFIRMED', method: 'ONLINE_GATEWAY', ...applied },
      },
      tx,
    );
    await tx.notificationIntent.createMany({
      data: [
        {
          id: newId(),
          tenantId: p.tenantId,
          kind: 'PAYMENT_CONFIRMED',
          studentId: p.studentId,
          payload: {
            paymentId: p.id,
            amountMinor: p.amountMinor,
            receiptNumber: applied.receiptNumber,
          },
        },
      ],
    });
  }

  /** A gateway said this payment failed: nothing was applied, so there is nothing to undo. */
  async failFromGateway(
    tx: TransactionClient,
    p: {
      id: string;
      tenantId: string;
      studentId: string;
      status: PaymentStatus;
      amountMinor: number;
    },
    reason: string,
  ): Promise<void> {
    if (!nextPayment(p.status, 'fail', 'FAILED')) throw this.notInStatus(p.status);
    await tx.payment.update({
      where: { id: p.id },
      data: { status: 'FAILED', rejectionReason: reason, version: { increment: 1 } },
    });
    await this.audit.record(
      {
        action: 'finance.payment_rejected',
        entityType: 'Payment',
        entityId: p.id,
        before: { status: 'PENDING' },
        after: { status: 'FAILED', method: 'ONLINE_GATEWAY' },
        metadata: { reason },
      },
      tx,
    );
    await tx.notificationIntent.createMany({
      data: [
        {
          id: newId(),
          tenantId: p.tenantId,
          kind: 'PAYMENT_REJECTED',
          studentId: p.studentId,
          payload: { paymentId: p.id, amountMinor: p.amountMinor, reason },
        },
      ],
    });
  }

  /** Held until the transaction ends: a second verify or refund waits, then sees what this did. */
  async lockPayment(tx: TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM payment WHERE id = ${id}::uuid FOR UPDATE`;
  }

  /** A waiting payment that staff may decide; gateway ones answer only to the gateway (§12.3). */
  private async loadWaiting(tx: TransactionClient, id: string, version: number): Promise<Row> {
    await this.lockPayment(tx, id);
    const row = await tx.payment.findFirst({
      where: { AND: [{ id }, this.scope('payment.verify')] },
      select: SUMMARY,
    });
    if (!row) throw new DomainError('NOT_FOUND', 'payment');
    if (row.status !== 'PENDING' || row.source === 'GATEWAY') throw this.notInStatus(row.status);
    if (row.version !== version) throw new DomainError('VERSION_CONFLICT');
    return row;
  }

  /** Staff verified a reported payment or cleared a cheque: confirmed, applied, one receipt. */
  async confirm(id: string, version: number): Promise<Payment> {
    const verifiedById = this.membershipId();
    await this.db.$transaction(async (tx) => {
      const row = await this.loadWaiting(tx, id, version);
      if (!nextPayment(row.status, 'confirm', 'CONFIRMED')) throw this.notInStatus(row.status);
      const now = new Date();
      await tx.payment.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          confirmedAt: now,
          verifiedById,
          verifiedAt: now,
          version: { increment: 1 },
        },
      });
      const applied = await this.applyAndNumber(tx, {
        id,
        tenantId: row.tenantId,
        studentId: row.studentId,
        amountMinor: row.amountMinor,
        allocateTo: row.allocateTo,
        needsReview: false,
        actorId: verifiedById,
      });
      await this.audit.record(
        {
          action: 'finance.payment_confirmed',
          entityType: 'Payment',
          entityId: id,
          before: { status: row.status },
          after: { status: 'CONFIRMED', method: row.method, ...applied },
        },
        tx,
      );
      if (row.source === 'PARENT_REPORTED')
        await tx.notificationIntent.createMany({
          data: [
            {
              id: newId(),
              tenantId: row.tenantId,
              kind: 'PAYMENT_CONFIRMED',
              studentId: row.studentId,
              payload: {
                paymentId: id,
                amountMinor: row.amountMinor,
                receiptNumber: applied.receiptNumber,
              },
            },
          ],
        });
      await this.analytics.track(tx, 'payment.verified', { outcome: 'CONFIRMED' });
    });
    return this.get(id);
  }

  /** Reject a report or bounce a cheque: nothing is applied, no receipt, the reason is kept. */
  async reject(id: string, input: RejectPayment): Promise<Payment> {
    const verifiedById = this.membershipId();
    const t = createServerTranslator('finance');
    await this.db.$transaction(async (tx) => {
      const row = await this.loadWaiting(tx, id, input.version);
      if (!nextPayment(row.status, 'fail', 'FAILED')) throw this.notInStatus(row.status);
      if (input.bounceChargeMinor && row.method !== 'CHEQUE')
        throw new DomainError('VALIDATION_FAILED', 'only cheques bounce', [
          { path: 'bounceChargeMinor', issue: 'not_a_cheque' },
        ]);
      await tx.payment.update({
        where: { id },
        data: {
          status: 'FAILED',
          rejectionReason: input.reason,
          verifiedById,
          verifiedAt: new Date(),
          version: { increment: 1 },
        },
      });
      let chargeInvoiceId: string | null = null;
      if (input.bounceChargeMinor) {
        // The charge is an invoice, so it takes the rights an invoice takes.
        const place = { branchId: row.branchId };
        assertInScope(this.cls, 'invoice.create', invoicePolicy, place);
        assertInScope(this.cls, 'invoice.issue', invoicePolicy, place);
        const { settings } = await this.settings.current(tx);
        chargeInvoiceId = await this.invoices.insertDraft(tx, {
          tenantId: row.tenantId,
          branchId: row.branchId,
          studentId: row.studentId,
          kind: 'ONE_TIME',
          dueDate: addDays(await this.today(tx), settings.policy.dueDay),
          charges: [
            {
              label: t('lines.bounceCharge', { reference: row.reference ?? '' }),
              amountMinor: input.bounceChargeMinor,
              quantity: 1,
              taxable: false,
            },
          ],
          discounts: [],
          note: null,
          createdById: verifiedById,
          settings,
        });
        await this.invoices.issueIn(tx, chargeInvoiceId, 1);
      }
      await this.audit.record(
        {
          action: 'finance.payment_rejected',
          entityType: 'Payment',
          entityId: id,
          before: { status: row.status },
          after: { status: 'FAILED', method: row.method, chargeInvoiceId },
          metadata: { reason: input.reason },
        },
        tx,
      );
      if (row.source === 'PARENT_REPORTED')
        await tx.notificationIntent.createMany({
          data: [
            {
              id: newId(),
              tenantId: row.tenantId,
              kind: 'PAYMENT_REJECTED',
              studentId: row.studentId,
              payload: { paymentId: id, amountMinor: row.amountMinor, reason: input.reason },
            },
          ],
        });
      await this.analytics.track(tx, 'payment.verified', { outcome: 'REJECTED' });
    });
    return this.get(id);
  }

  /**
   * A manual refund (G-30, C-150): append-only. It comes from this payment's unused credit first,
   * then from the invoices it paid (newest first), which owe that amount again. Credit already
   * spent on another invoice can't be refunded from here; staff cancel that invoice first.
   */
  async refund(id: string, input: RefundPayment): Promise<Payment> {
    const recordedById = this.membershipId();
    await this.db.$transaction(async (tx) => {
      await this.lockPayment(tx, id);
      const row = await tx.payment.findFirst({
        where: { AND: [{ id }, this.scope('payment.refund')] },
        select: {
          ...SUMMARY,
          allocations: { orderBy: { id: 'desc' }, select: { invoiceId: true, amountMinor: true } },
          credits: { select: { amountMinor: true } },
        },
      });
      if (!row) throw new DomainError('NOT_FOUND', 'payment');
      if (row.status !== 'CONFIRMED' && row.status !== 'PARTIALLY_REFUNDED')
        throw this.notInStatus(row.status);
      if (row.version !== input.version) throw new DomainError('VERSION_CONFLICT');
      const status = afterRefund({
        status: row.status,
        amountMinor: row.amountMinor,
        refundedMinor: row.refundedMinor,
        refundMinor: input.amountMinor,
      });
      if (!status)
        throw new DomainError('VALIDATION_FAILED', 'more than is left', [
          { path: 'amountMinor', issue: 'exceeds_refundable' },
        ]);

      // Net paid per invoice, newest allocation first.
      const net = new Map<string, number>();
      for (const a of row.allocations)
        net.set(a.invoiceId, (net.get(a.invoiceId) ?? 0) + a.amountMinor);
      const applied = [...net.entries()]
        .filter(([, amountMinor]) => amountMinor > 0)
        .map(([invoiceId, amountMinor]) => ({ invoiceId, amountMinor }));
      const invoices = await tx.$queryRaw<LockedInvoice[]>`
        SELECT id, status, due_date, total_minor, paid_minor, credit_applied_minor, written_off_minor
          FROM invoice WHERE id = ANY(${applied.map((a) => a.invoiceId)}::uuid[])
         ORDER BY id FOR UPDATE`;

      await this.invoices.lockCredit(tx, row.studentId);
      const unused = row.credits.reduce((sum, c) => sum + c.amountMinor, 0);
      const balance = await this.invoices.creditBalance(tx, row.studentId);
      const { fromCreditMinor, reversals, shortMinor } = refundSources(
        input.amountMinor,
        Math.min(unused, balance),
        applied,
      );
      if (shortMinor > 0)
        throw new DomainError('CONFLICT', 'credit already used', [
          { path: 'amountMinor', issue: 'credit_already_used' },
        ]);

      const refundId = newId();
      const refundedOn = await this.today(tx);
      await tx.refund.create({
        data: {
          id: refundId,
          tenantId: row.tenantId,
          paymentId: id,
          amountMinor: input.amountMinor,
          method: input.method,
          reference: input.reference ?? null,
          reason: input.reason,
          refundedOn: at(refundedOn),
          recordedById,
        },
      });
      if (fromCreditMinor > 0)
        await tx.creditEntry.create({
          data: {
            id: newId(),
            tenantId: row.tenantId,
            studentId: row.studentId,
            kind: 'REFUNDED',
            amountMinor: -fromCreditMinor,
            paymentId: id,
            createdById: recordedById,
          },
        });
      for (const r of reversals) {
        const inv = invoices.find((i) => i.id === r.invoiceId)!;
        await tx.paymentAllocation.create({
          data: {
            id: newId(),
            tenantId: row.tenantId,
            paymentId: id,
            invoiceId: r.invoiceId,
            amountMinor: -r.amountMinor,
            refundId,
          },
        });
        await this.settleInvoice(tx, inv, inv.paid_minor - r.amountMinor);
      }
      await tx.payment.update({
        where: { id },
        data: {
          status,
          refundedMinor: row.refundedMinor + input.amountMinor,
          version: { increment: 1 },
        },
      });
      await this.audit.record(
        {
          action: 'finance.payment_refunded',
          entityType: 'Payment',
          entityId: id,
          before: { status: row.status, refundedMinor: row.refundedMinor },
          after: { status, refundedMinor: row.refundedMinor + input.amountMinor, fromCreditMinor },
          metadata: { reason: input.reason, method: input.method },
        },
        tx,
      );
      await this.analytics.track(tx, 'refund.recorded', { partial: status !== 'REFUNDED' });
    });
    return this.get(id);
  }

  /** The parent's screenshot, for whoever decides: a short link, and every view is audited. */
  async evidenceLink(id: string): Promise<{ url: string; expiresAt: string }> {
    const row = await this.db.payment.findFirst({
      where: { AND: [{ id }, this.scope('payment.verify')] },
      select: { evidenceKey: true },
    });
    if (!row?.evidenceKey) throw new DomainError('NOT_FOUND', 'evidence');
    await this.audit.record({
      action: 'finance.payment_evidence_viewed',
      entityType: 'Payment',
      entityId: id,
    });
    return {
      url: await this.storage.signedGet(row.evidenceKey, LINK_SECONDS),
      expiresAt: new Date(Date.now() + LINK_SECONDS * 1000).toISOString(),
    };
  }
}
