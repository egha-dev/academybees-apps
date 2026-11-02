import {
  type CreateInvoice,
  decodeCursor,
  encodeCursor,
  type FinanceSettings,
  type Invoice,
  type InvoiceSummary,
  localDate,
  addDays,
  newId,
  type UpdateInvoice,
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
import { assertInScope, scopedWhere } from '../../core/rbac/scope.js';
import { StudentsService } from '../people/index.js';
import { isOverdue, nextInvoice, settledStatus } from './domain/invoice.state.js';
import { balanceOf, computeInvoice, type TaxConfig } from './domain/money.js';
import { invoicePolicy } from './finance.policy.js';
import { FinanceSettingsService } from './finance-settings.service.js';
import { nextNumber } from './invoice-numbers.js';

const at = (d: string) => new Date(`${d}T00:00:00Z`);
const day = (d: Date) => d.toISOString().slice(0, 10);
const dayOrNull = (d: Date | null) => (d ? day(d) : null);

const SUMMARY = {
  id: true,
  number: true,
  kind: true,
  status: true,
  studentId: true,
  student: { select: { fullName: true, admissionNo: true } },
  issueDate: true,
  dueDate: true,
  cycleStart: true,
  cycleEnd: true,
  currency: true,
  totalMinor: true,
  paidMinor: true,
  creditAppliedMinor: true,
  writtenOffMinor: true,
  version: true,
} satisfies Prisma.InvoiceSelect;

const DETAIL = {
  ...SUMMARY,
  tenantId: true,
  branchId: true,
  assignmentId: true,
  forInvoiceId: true,
  instalmentNo: true,
  instalmentOf: true,
  subtotalMinor: true,
  discountMinor: true,
  taxMinor: true,
  overdueSince: true,
  note: true,
  closeReason: true,
  createdAt: true,
  lines: {
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      kind: true,
      label: true,
      quantity: true,
      unitMinor: true,
      amountMinor: true,
      taxable: true,
    },
  },
} satisfies Prisma.InvoiceSelect;

type SummaryRow = Prisma.InvoiceGetPayload<{ select: typeof SUMMARY }>;
type DetailRow = Prisma.InvoiceGetPayload<{ select: typeof DETAIL }>;

export type ChargeLine = { label: string; amountMinor: number; quantity: number; taxable: boolean };
export type DiscountLine = { label: string; amountMinor: number };

const toTax = (settings: FinanceSettings): TaxConfig =>
  settings.tax ? { rateBps: settings.tax.rateBps, mode: settings.tax.mode } : null;

/**
 * Lines and totals for an invoice (C-143). A charge keeps its listed unit price and quantity;
 * its amount is what `computeInvoice` says, so a draft can be recomputed from its own lines.
 */
function buildLines(
  tenantId: string,
  invoiceId: string,
  charges: ChargeLine[],
  discounts: DiscountLine[],
  settings: FinanceSettings,
) {
  const computed = computeInvoice(
    charges.map((c) => ({
      label: c.label,
      amountMinor: c.amountMinor * c.quantity,
      taxable: c.taxable,
    })),
    discounts,
    toTax(settings),
  );
  let charge = 0;
  const lines = computed.lines.map((l, i) => {
    const source = l.kind === 'CHARGE' ? charges[charge++] : undefined;
    return {
      id: newId(),
      tenantId,
      invoiceId,
      kind: l.kind,
      label: l.kind === 'TAX' ? (settings.tax?.label ?? l.label) : l.label,
      quantity: source?.quantity ?? 1,
      unitMinor: source?.amountMinor ?? l.amountMinor,
      amountMinor: l.amountMinor,
      taxable: l.taxable,
      sortOrder: i,
    };
  });
  return { lines, computed };
}

/**
 * Invoices (ARCHITECTURE §12.1, C-138…C-143). Drafts can change; issuing numbers the invoice,
 * freezes what it says and applies the student's credit. After that only its settlement moves:
 * corrections go through credit, refund, cancel (no money received) or write-off.
 */
@Injectable()
export class InvoicesService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
    private readonly settings: FinanceSettingsService,
    private readonly students: StudentsService,
  ) {}

  private scope(
    capability: 'invoice.read' | 'invoice.create' | 'invoice.issue' | 'invoice.cancel',
  ): Prisma.InvoiceWhereInput {
    return scopedWhere(this.cls, capability, invoicePolicy);
  }

  private async zone(db: Pick<TransactionClient, 'tenant'> = this.db) {
    const t = await db.tenant.findFirst({ select: { name: true, timezone: true } });
    const timeZone = t?.timezone ?? 'Asia/Kolkata';
    return { name: t?.name ?? '', timeZone, today: localDate(new Date(), timeZone) };
  }

  private toSummary(r: SummaryRow, today: string): InvoiceSummary {
    const balanceMinor = balanceOf(r);
    return {
      id: r.id,
      number: r.number,
      kind: r.kind,
      status: r.status,
      studentId: r.studentId,
      studentName: r.student.fullName,
      issueDate: dayOrNull(r.issueDate),
      dueDate: day(r.dueDate),
      cycleStart: dayOrNull(r.cycleStart),
      cycleEnd: dayOrNull(r.cycleEnd),
      currency: r.currency,
      totalMinor: r.totalMinor,
      paidMinor: r.paidMinor,
      creditAppliedMinor: r.creditAppliedMinor,
      writtenOffMinor: r.writtenOffMinor,
      balanceMinor,
      overdue: isOverdue({ status: r.status, dueDate: day(r.dueDate), balanceMinor }, today),
      version: r.version,
    };
  }

  private toInvoice(r: DetailRow, today: string): Invoice {
    return {
      ...this.toSummary(r, today),
      assignmentId: r.assignmentId,
      forInvoiceId: r.forInvoiceId,
      instalmentNo: r.instalmentNo,
      instalmentOf: r.instalmentOf,
      subtotalMinor: r.subtotalMinor,
      discountMinor: r.discountMinor,
      taxMinor: r.taxMinor,
      overdueSince: dayOrNull(r.overdueSince),
      note: r.note,
      closeReason: r.closeReason,
      lines: r.lines,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async list(query: {
    status?: string | undefined;
    studentId?: string | undefined;
    kind?: string | undefined;
    cursor?: string | undefined;
    limit: number;
  }) {
    const { today } = await this.zone();
    const after = query.cursor ? decodeCursor(query.cursor, z.object({ id: z.uuid() })) : null;
    if (query.cursor && !after)
      throw new DomainError('VALIDATION_FAILED', 'bad cursor', [
        { path: 'cursor', issue: 'invalid' },
      ]);
    const open = { status: { in: ['ISSUED', 'PARTIALLY_PAID'] } } as Prisma.InvoiceWhereInput;
    const status: Prisma.InvoiceWhereInput =
      query.status === 'OPEN'
        ? open
        : query.status === 'OVERDUE'
          ? { ...open, dueDate: { lt: at(today) } }
          : query.status
            ? ({ status: query.status } as Prisma.InvoiceWhereInput)
            : {};
    const rows = await this.db.invoice.findMany({
      where: {
        AND: [
          this.scope('invoice.read'),
          status,
          query.studentId ? { studentId: query.studentId } : {},
          query.kind ? ({ kind: query.kind } as Prisma.InvoiceWhereInput) : {},
          after ? { id: { lt: after.id } } : {},
        ],
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      select: SUMMARY,
    });
    const page = rows.slice(0, query.limit);
    return {
      items: page.map((r) => this.toSummary(r, today)),
      nextCursor:
        rows.length > query.limit ? encodeCursor({ id: page[page.length - 1]!.id }) : null,
    };
  }

  async get(id: string): Promise<Invoice> {
    const { today } = await this.zone();
    const row = await this.db.invoice.findFirst({
      where: { AND: [{ id }, this.scope('invoice.read')] },
      select: DETAIL,
    });
    if (!row) throw new DomainError('NOT_FOUND', 'invoice');
    return this.toInvoice(row, today);
  }

  async create(input: CreateInvoice): Promise<Invoice> {
    const membershipId = this.cls.get('membership')!.id;
    const id = await this.db.$transaction(async (tx) => {
      const [student] = await this.students.forFees(tx, [input.studentId]);
      assertInScope(this.cls, 'invoice.create', invoicePolicy, { branchId: student!.branchId });
      const { settings } = await this.settings.current(tx);
      const created = await this.insertDraft(tx, {
        tenantId: this.cls.get('tenantId'),
        branchId: student!.branchId,
        studentId: input.studentId,
        kind: input.kind,
        dueDate: input.dueDate,
        charges: input.charges,
        discounts: input.discounts,
        note: input.note ?? null,
        createdById: membershipId,
        settings,
      });
      await this.audit.record(
        {
          action: 'finance.invoice_created',
          entityType: 'Invoice',
          entityId: created,
          after: input,
        },
        tx,
      );
      if (input.issue) {
        assertInScope(this.cls, 'invoice.issue', invoicePolicy, { branchId: student!.branchId });
        await this.issueIn(tx, created, 1);
      }
      return created;
    });
    return this.get(id);
  }

  /** A draft invoice with its lines and totals; for this service and the generation job. */
  async insertDraft(
    tx: TransactionClient,
    input: {
      tenantId: string;
      branchId: string;
      studentId: string;
      kind: 'REGULAR' | 'ONE_TIME' | 'OPENING_BALANCE' | 'LATE_FEE' | 'INSTALMENT';
      dueDate: string;
      charges: ChargeLine[];
      discounts: DiscountLine[];
      note: string | null;
      createdById: string | null;
      settings: FinanceSettings;
      assignmentId?: string | undefined;
      cycleStart?: string | undefined;
      cycleEnd?: string | undefined;
      instalmentNo?: number | undefined;
      instalmentOf?: number | undefined;
      forInvoiceId?: string | undefined;
    },
  ): Promise<string> {
    const id = newId();
    const { lines, computed } = buildLines(
      input.tenantId,
      id,
      input.charges,
      input.discounts,
      input.settings,
    );
    await tx.invoice.create({
      data: {
        id,
        tenantId: input.tenantId,
        branchId: input.branchId,
        studentId: input.studentId,
        kind: input.kind,
        dueDate: at(input.dueDate),
        subtotalMinor: computed.subtotalMinor,
        discountMinor: computed.discountMinor,
        taxMinor: computed.taxMinor,
        totalMinor: computed.totalMinor,
        note: input.note,
        createdById: input.createdById,
        assignmentId: input.assignmentId ?? null,
        cycleStart: input.cycleStart ? at(input.cycleStart) : null,
        cycleEnd: input.cycleEnd ? at(input.cycleEnd) : null,
        instalmentNo: input.instalmentNo ?? null,
        instalmentOf: input.instalmentOf ?? null,
        forInvoiceId: input.forInvoiceId ?? null,
      },
    });
    await tx.invoiceLine.createMany({ data: lines });
    return id;
  }

  private async load(
    tx: TransactionClient,
    id: string,
    capability: 'invoice.create' | 'invoice.issue' | 'invoice.cancel',
  ): Promise<DetailRow> {
    const row = await tx.invoice.findFirst({
      where: { AND: [{ id }, this.scope(capability)] },
      select: DETAIL,
    });
    if (!row) throw new DomainError('NOT_FOUND', 'invoice');
    return row;
  }

  private notInStatus(status: string): DomainError {
    return new DomainError('INVALID_STATE_TRANSITION', `invoice ${status}`, [
      { path: 'status', issue: status.toLowerCase() },
    ]);
  }

  /** Drafts only: any part can change, and the totals follow. */
  async update(id: string, input: UpdateInvoice): Promise<Invoice> {
    await this.db.$transaction(async (tx) => {
      const row = await this.load(tx, id, 'invoice.create');
      if (row.status !== 'DRAFT') throw this.notInStatus(row.status);
      const { settings } = await this.settings.current(tx);
      const charges =
        input.charges ??
        row.lines
          .filter((l) => l.kind === 'CHARGE')
          .map((l) => ({
            label: l.label,
            amountMinor: l.unitMinor,
            quantity: l.quantity,
            taxable: l.taxable,
          }));
      const discounts =
        input.discounts ??
        row.lines
          .filter((l) => l.kind === 'DISCOUNT')
          .map((l) => ({ label: l.label, amountMinor: -l.amountMinor }));
      const { lines, computed } = buildLines(row.tenantId, id, charges, discounts, settings);
      const updated = await tx.invoice.updateMany({
        where: { id, version: input.version, status: 'DRAFT' },
        data: {
          ...(input.dueDate ? { dueDate: at(input.dueDate) } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          subtotalMinor: computed.subtotalMinor,
          discountMinor: computed.discountMinor,
          taxMinor: computed.taxMinor,
          totalMinor: computed.totalMinor,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceLine.createMany({ data: lines });
    });
    return this.get(id);
  }

  /** Drafts can be deleted (§12.1); the database refuses anything else too. */
  async remove(id: string, version: number): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const row = await this.load(tx, id, 'invoice.create');
      if (row.status !== 'DRAFT') throw this.notInStatus(row.status);
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      const removed = await tx.invoice.deleteMany({ where: { id, version, status: 'DRAFT' } });
      if (removed.count !== 1) throw new DomainError('VERSION_CONFLICT');
      await this.audit.record(
        { action: 'finance.invoice_deleted', entityType: 'Invoice', entityId: id },
        tx,
      );
    });
  }

  async issue(id: string, version: number): Promise<Invoice> {
    await this.db.$transaction(async (tx) => {
      await this.load(tx, id, 'invoice.issue');
      await this.issueIn(tx, id, version);
    });
    return this.get(id);
  }

  /**
   * Issue inside the caller's transaction, without a scope check (the caller made it, or it is
   * the academy's own job): totals recomputed from the lines under today's tax settings, the
   * next number, what the document will say frozen, and the student's credit applied (C-140).
   */
  async issueIn(tx: TransactionClient, id: string, version: number): Promise<void> {
    const row = await tx.invoice.findFirst({ where: { id }, select: DETAIL });
    if (!row) throw new DomainError('NOT_FOUND', 'invoice');
    if (row.status !== 'DRAFT') throw this.notInStatus(row.status);
    const { settings } = await this.settings.current(tx);
    const { name, today } = await this.zone(tx);
    const { lines, computed } = buildLines(
      row.tenantId,
      id,
      row.lines
        .filter((l) => l.kind === 'CHARGE')
        .map((l) => ({
          label: l.label,
          amountMinor: l.unitMinor,
          quantity: l.quantity,
          taxable: l.taxable,
        })),
      row.lines
        .filter((l) => l.kind === 'DISCOUNT')
        .map((l) => ({ label: l.label, amountMinor: -l.amountMinor })),
      settings,
    );
    const number = await nextNumber(tx, {
      tenantId: row.tenantId,
      kind: 'INVOICE',
      localDate: today,
      prefix: settings.prefixes.INVOICE,
    });
    const credit = settings.policy.autoApplyCredit
      ? await this.useCredit(tx, row.tenantId, row.studentId, id, computed.totalMinor)
      : 0;
    const status = settledStatus({
      totalMinor: computed.totalMinor,
      paidMinor: 0,
      creditAppliedMinor: credit,
    });
    if (!nextInvoice('DRAFT', 'issue', status)) throw this.notInStatus(row.status);
    // Before the status changes: the database lets only a draft's lines be deleted.
    await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
    const updated = await tx.invoice.updateMany({
      where: { id, version, status: 'DRAFT' },
      data: {
        status,
        number,
        issueDate: at(today),
        subtotalMinor: computed.subtotalMinor,
        discountMinor: computed.discountMinor,
        taxMinor: computed.taxMinor,
        totalMinor: computed.totalMinor,
        creditAppliedMinor: credit,
        snapshot: {
          academy: { name },
          student: { name: row.student.fullName, admissionNo: row.student.admissionNo },
          tax: settings.tax,
          lines: lines.map((l) => ({
            kind: l.kind,
            label: l.label,
            quantity: l.quantity,
            unitMinor: l.unitMinor,
            amountMinor: l.amountMinor,
          })),
          totals: computed,
        },
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
    await tx.invoiceLine.createMany({ data: lines });
    await this.audit.record(
      {
        action: 'finance.invoice_issued',
        entityType: 'Invoice',
        entityId: id,
        after: { number, totalMinor: computed.totalMinor, creditAppliedMinor: credit },
      },
      tx,
    );
    await this.analytics.track(tx, 'invoice.issued', { kind: row.kind, lines: lines.length });
  }

  /** One student's credit moves one at a time (C-140): held until the transaction ends. */
  private async lockCredit(tx: TransactionClient, studentId: string) {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`credit:${studentId}`}))`;
  }

  /** The student's credit balance: the sum of the append-only ledger. */
  async creditBalance(db: Pick<TransactionClient, 'creditEntry'>, studentId: string) {
    const sum = await db.creditEntry.aggregate({
      where: { studentId },
      _sum: { amountMinor: true },
    });
    return sum._sum.amountMinor ?? 0;
  }

  private async useCredit(
    tx: TransactionClient,
    tenantId: string,
    studentId: string,
    invoiceId: string,
    upTo: number,
  ): Promise<number> {
    await this.lockCredit(tx, studentId);
    const use = Math.min(await this.creditBalance(tx, studentId), upTo);
    if (use <= 0) return 0;
    await tx.creditEntry.create({
      data: { id: newId(), tenantId, studentId, kind: 'APPLIED', amountMinor: -use, invoiceId },
    });
    return use;
  }

  /** Cancel when no money was received (§12.1); credit used on it goes back to the student. */
  async cancel(id: string, input: { version: number; reason: string }): Promise<Invoice> {
    const membershipId = this.cls.get('membership')!.id;
    await this.db.$transaction(async (tx) => {
      const row = await this.load(tx, id, 'invoice.cancel');
      if (!nextInvoice(row.status, 'cancel', 'CANCELLED')) throw this.notInStatus(row.status);
      if (row.paidMinor > 0)
        throw new DomainError('INVALID_STATE_TRANSITION', 'has payments', [
          { path: 'paidMinor', issue: 'has_payments' },
        ]);
      const updated = await tx.invoice.updateMany({
        where: { id, version: input.version, paidMinor: 0 },
        data: {
          status: 'CANCELLED',
          creditAppliedMinor: 0,
          overdueSince: null,
          closeReason: input.reason,
          closedAt: new Date(),
          closedById: membershipId,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
      if (row.creditAppliedMinor > 0) {
        await this.lockCredit(tx, row.studentId);
        await tx.creditEntry.create({
          data: {
            id: newId(),
            tenantId: row.tenantId,
            studentId: row.studentId,
            kind: 'MANUAL',
            amountMinor: row.creditAppliedMinor,
            invoiceId: id,
            createdById: membershipId,
          },
        });
      }
      await this.audit.record(
        {
          action: 'finance.invoice_cancelled',
          entityType: 'Invoice',
          entityId: id,
          metadata: { reason: input.reason, creditReturnedMinor: row.creditAppliedMinor },
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** C-141: close with the balance unpaid; payments already made stay. */
  async writeOff(id: string, input: { version: number; reason: string }): Promise<Invoice> {
    const membershipId = this.cls.get('membership')!.id;
    await this.db.$transaction(async (tx) => {
      const row = await this.load(tx, id, 'invoice.cancel');
      if (!nextInvoice(row.status, 'write_off', 'WRITTEN_OFF')) throw this.notInStatus(row.status);
      const balance = balanceOf(row);
      const updated = await tx.invoice.updateMany({
        where: { id, version: input.version },
        data: {
          status: 'WRITTEN_OFF',
          writtenOffMinor: balance,
          overdueSince: null,
          closeReason: input.reason,
          closedAt: new Date(),
          closedById: membershipId,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
      await this.audit.record(
        {
          action: 'finance.invoice_written_off',
          entityType: 'Invoice',
          entityId: id,
          metadata: { reason: input.reason, writtenOffMinor: balance },
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** Nightly (C-19): keep `overdueSince` in step with the derived overdue state. */
  async markOverdue(tx: TransactionClient, today: string): Promise<number> {
    const marked = await tx.$executeRaw`
      UPDATE invoice SET overdue_since = due_date + 1
       WHERE status IN ('ISSUED', 'PARTIALLY_PAID') AND overdue_since IS NULL
         AND due_date < ${today}::date`;
    await tx.$executeRaw`
      UPDATE invoice SET overdue_since = NULL
       WHERE overdue_since IS NOT NULL AND status NOT IN ('ISSUED', 'PARTIALLY_PAID')`;
    return marked;
  }

  /** Overdue past the academy's threshold, with no late fee yet (C-140). Staff decide. */
  async lateFeeSuggestions() {
    const { today } = await this.zone();
    const { settings } = await this.settings.current();
    const rule = settings.policy.lateFee;
    if (!rule) return { rule: null, items: [] };
    const rows = await this.db.invoice.findMany({
      where: {
        AND: [
          this.scope('invoice.read'),
          {
            status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
            kind: { not: 'LATE_FEE' },
            dueDate: { lt: at(addDays(today, -rule.afterDays)) },
          },
        ],
      },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      take: 200,
      select: SUMMARY,
    });
    const charged = await this.db.invoice.findMany({
      where: { forInvoiceId: { in: rows.map((r) => r.id) }, status: { not: 'CANCELLED' } },
      select: { forInvoiceId: true },
    });
    const done = new Set(charged.map((c) => c.forInvoiceId));
    return {
      rule,
      items: rows
        .filter((r) => !done.has(r.id))
        .map((r) => ({
          invoice: this.toSummary(r, today),
          daysOverdue: Math.round((at(today).getTime() - r.dueDate.getTime()) / 86_400_000),
          amountMinor: rule.amountMinor,
        })),
    };
  }

  /** Staff approve a suggested late fee: its own invoice, since issued ones never change. */
  async applyLateFee(forInvoiceId: string): Promise<Invoice> {
    const membershipId = this.cls.get('membership')!.id;
    const { today } = await this.zone();
    const t = createServerTranslator('finance');
    const id = await this.db.$transaction(async (tx) => {
      const row = await this.load(tx, forInvoiceId, 'invoice.create');
      await this.load(tx, forInvoiceId, 'invoice.issue');
      const { settings } = await this.settings.current(tx);
      const rule = settings.policy.lateFee;
      if (!rule)
        throw new DomainError('CONFLICT', 'no late fee set', [
          { path: 'policy.lateFee', issue: 'not_configured' },
        ]);
      if (row.status !== 'ISSUED' && row.status !== 'PARTIALLY_PAID')
        throw this.notInStatus(row.status);
      if (row.kind === 'LATE_FEE' || day(row.dueDate) >= addDays(today, -rule.afterDays))
        throw new DomainError('CONFLICT', 'not due a late fee', [
          { path: 'dueDate', issue: 'not_due' },
        ]);
      const existing = await tx.invoice.findFirst({
        where: { forInvoiceId, status: { not: 'CANCELLED' } },
        select: { id: true },
      });
      if (existing)
        throw new DomainError('CONFLICT', 'late fee already charged', [
          { path: 'forInvoiceId', issue: 'already_charged' },
        ]);
      const created = await this.insertDraft(tx, {
        tenantId: row.tenantId,
        branchId: row.branchId,
        studentId: row.studentId,
        kind: 'LATE_FEE',
        dueDate: addDays(today, settings.policy.dueDay),
        charges: [
          {
            label: t('lines.lateFee', { number: row.number ?? '' }),
            amountMinor: rule.amountMinor,
            quantity: 1,
            taxable: false,
          },
        ],
        discounts: [],
        note: null,
        createdById: membershipId,
        settings,
        forInvoiceId,
      });
      await this.issueIn(tx, created, 1);
      return created;
    });
    return this.get(id);
  }
}
