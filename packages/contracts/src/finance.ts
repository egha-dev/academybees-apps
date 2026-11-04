import { z } from 'zod';

import { CalendarDateSchema } from './students.js';
import { VpaSchema } from './vpa.js';

/**
 * Academy finance contracts (Phase 7; PRD v2 §19, G-04, G-30, ADR-038, C-137…C-146). Money is
 * integer minor units (ADR-010); dates are academy-local `YYYY-MM-DD`.
 */

const Name = z.string().trim().min(1).max(120);
const Version = z.number().int().min(1);
/** ₹1 crore cap per amount: far above any academy fee, well inside a 32-bit integer. */
export const AmountMinorSchema = z.number().int().min(0).max(1_000_000_000);
export const CurrencySchema = z.string().regex(/^[A-Z]{3}$/);

export const FEE_CYCLES = ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL', 'CUSTOM'] as const;
export const FeeCycleSchema = z.enum(FEE_CYCLES);
export const FeeRecordStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);

// ── Fee plans ────────────────────────────────────────────────────────────────────────────

export const FeeComponentInputSchema = z.object({
  name: Name,
  amountMinor: AmountMinorSchema,
  taxable: z.boolean().default(true),
});
export const FeeComponentSchema = FeeComponentInputSchema.extend({
  id: z.uuid(),
  sortOrder: z.number().int(),
});

export const FeePlanSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  cycle: FeeCycleSchema,
  cycleMonths: z.number().int().nullable(),
  currency: CurrencySchema,
  status: FeeRecordStatusSchema,
  version: z.number().int(),
  components: z.array(FeeComponentSchema),
  /** Sum of the components, per cycle. */
  totalMinor: z.number().int(),
  /** Active assignments using it. */
  assignedCount: z.number().int(),
});
export type FeePlan = z.infer<typeof FeePlanSchema>;
export const FeePlanListSchema = z.object({ items: z.array(FeePlanSchema) });
export const FeePlanListQuerySchema = z.object({
  status: FeeRecordStatusSchema.default('ACTIVE'),
});

const cycleShape = <
  T extends { cycle?: string | undefined; cycleMonths?: number | null | undefined },
>(
  v: T,
  ctx: z.RefinementCtx,
) => {
  if (v.cycle === undefined) return;
  if ((v.cycle === 'CUSTOM') !== (v.cycleMonths !== null && v.cycleMonths !== undefined))
    ctx.addIssue({
      code: 'custom',
      path: ['cycleMonths'],
      message: v.cycle === 'CUSTOM' ? 'required_for_custom' : 'only_for_custom',
    });
};

export const CreateFeePlanSchema = z
  .object({
    name: Name,
    cycle: FeeCycleSchema,
    cycleMonths: z.number().int().min(1).max(36).nullable().optional(),
    components: z.array(FeeComponentInputSchema).min(1).max(20),
  })
  .superRefine(cycleShape);
export type CreateFeePlan = z.infer<typeof CreateFeePlanSchema>;

/** Changes apply to invoices made from now on; issued invoices keep what they say (C-142). */
export const UpdateFeePlanSchema = z
  .object({
    version: Version,
    name: Name.optional(),
    cycle: FeeCycleSchema.optional(),
    cycleMonths: z.number().int().min(1).max(36).nullable().optional(),
    /** Replaces every component. */
    components: z.array(FeeComponentInputSchema).min(1).max(20).optional(),
    status: FeeRecordStatusSchema.optional(),
  })
  .superRefine(cycleShape);
export type UpdateFeePlan = z.infer<typeof UpdateFeePlanSchema>;

// ── Assignments (a student on a plan) ─────────────────────────────────────────────────────

export const DiscountSchema = z.discriminatedUnion('kind', [
  /** Basis points: 1000 = 10%. */
  z.object({ kind: z.literal('PERCENT'), value: z.number().int().min(1).max(10_000) }),
  /** Minor units per cycle. */
  z.object({ kind: z.literal('FIXED'), value: AmountMinorSchema.min(1) }),
]);
export type DiscountInput = z.infer<typeof DiscountSchema>;

export const FeeAssignmentSchema = z.object({
  id: z.uuid(),
  studentId: z.uuid(),
  studentName: z.string(),
  planId: z.uuid(),
  planName: z.string(),
  batchId: z.uuid().nullable(),
  startsOn: CalendarDateSchema,
  endsOn: CalendarDateSchema.nullable(),
  discount: DiscountSchema.nullable(),
  discountReason: z.string().nullable(),
  instalments: z.number().int().nullable(),
  status: FeeRecordStatusSchema,
  version: z.number().int(),
});
export type FeeAssignment = z.infer<typeof FeeAssignmentSchema>;
export const FeeAssignmentListSchema = z.object({ items: z.array(FeeAssignmentSchema) });
export const FeeAssignmentListQuerySchema = z
  .object({
    studentId: z.uuid().optional(),
    planId: z.uuid().optional(),
    batchId: z.uuid().optional(),
    status: FeeRecordStatusSchema.default('ACTIVE'),
  })
  .refine((q) => q.studentId || q.planId || q.batchId, { message: 'filter_required' });

const assignmentShape = <
  T extends { startsOn?: string | undefined; endsOn?: string | null | undefined },
>(
  v: T,
  ctx: z.RefinementCtx,
) => {
  if (v.startsOn && v.endsOn && v.endsOn < v.startsOn)
    ctx.addIssue({ code: 'custom', path: ['endsOn'], message: 'before_start' });
};

const AssignmentTerms = {
  planId: z.uuid(),
  batchId: z.uuid().nullable().optional(),
  startsOn: CalendarDateSchema,
  endsOn: CalendarDateSchema.nullable().optional(),
  discount: DiscountSchema.nullable().optional(),
  discountReason: z.string().trim().max(200).nullable().optional(),
  instalments: z.number().int().min(2).max(12).nullable().optional(),
};

/** Put students on a plan: listed students, or everyone enrolled in `batchId` on `startsOn`. */
export const CreateFeeAssignmentsSchema = z
  .object({
    ...AssignmentTerms,
    studentIds: z.array(z.uuid()).min(1).max(500).optional(),
  })
  .superRefine(assignmentShape)
  .refine((v) => v.studentIds || v.batchId, {
    path: ['studentIds'],
    message: 'students_or_batch',
  });
export type CreateFeeAssignments = z.infer<typeof CreateFeeAssignmentsSchema>;

export const UpdateFeeAssignmentSchema = z.object({
  version: Version,
  endsOn: CalendarDateSchema.nullable().optional(),
  discount: DiscountSchema.nullable().optional(),
  discountReason: z.string().trim().max(200).nullable().optional(),
  instalments: z.number().int().min(2).max(12).nullable().optional(),
  status: FeeRecordStatusSchema.optional(),
});
export type UpdateFeeAssignment = z.infer<typeof UpdateFeeAssignmentSchema>;

// ── Settings → Payments (ADR-038, C-139…C-143) ────────────────────────────────────────────

export const PAYMENT_METHODS = [
  'CASH',
  'UPI',
  'BANK_TRANSFER',
  'CHEQUE',
  'CARD_POS',
  'ONLINE_GATEWAY',
] as const;
export const PaymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
/** Methods staff can record or switch off (the gateway is Phase G). */
export const STAFF_METHODS = ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CARD_POS'] as const;

export { VpaSchema };

export const GstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'invalid_gstin');
export const IfscSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'invalid_ifsc');
export const PrefixSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{1,12}$/, 'invalid_prefix');

export const MID_CYCLE_RULES = ['FULL', 'PRORATE_DAYS', 'PRORATE_SESSIONS', 'NEXT_CYCLE'] as const;

export const FinanceSettingsSchema = z.object({
  upi: z.object({ vpa: VpaSchema, payeeName: Name }).nullable().default(null),
  bank: z
    .object({
      accountName: Name,
      accountNumber: z
        .string()
        .trim()
        .regex(/^[0-9]{6,20}$/, 'invalid_account_number'),
      ifsc: IfscSchema,
      bankName: Name,
    })
    .nullable()
    .default(null),
  methods: z
    .object({
      CASH: z.boolean(),
      UPI: z.boolean(),
      BANK_TRANSFER: z.boolean(),
      CHEQUE: z.boolean(),
      CARD_POS: z.boolean(),
    })
    .default({ CASH: true, UPI: true, BANK_TRANSFER: true, CHEQUE: true, CARD_POS: true }),
  tax: z
    .object({
      gstin: GstinSchema,
      rateBps: z.number().int().min(1).max(2800),
      mode: z.enum(['EXCLUSIVE', 'INCLUSIVE']),
      label: z.string().trim().min(1).max(20).default('GST'),
    })
    .nullable()
    .default(null),
  prefixes: z
    .object({ INVOICE: PrefixSchema, RECEIPT: PrefixSchema })
    .default({ INVOICE: 'INV', RECEIPT: 'RCT' }),
  policy: z
    .object({
      midCycle: z.enum(MID_CYCLE_RULES).default('FULL'),
      sibling: z
        .discriminatedUnion('kind', [
          z.object({ kind: z.literal('PERCENT'), value: z.number().int().min(1).max(10_000) }),
          z.object({ kind: z.literal('FIXED'), value: AmountMinorSchema.min(1) }),
        ])
        .nullable()
        .default(null),
      autoApplyCredit: z.boolean().default(true),
      lateFee: z
        .object({
          afterDays: z.number().int().min(1).max(90),
          amountMinor: AmountMinorSchema.min(1),
        })
        .nullable()
        .default(null),
      generateDaysBefore: z.number().int().min(0).max(28).default(5),
      dueDay: z.number().int().min(1).max(28).default(10),
    })
    .default({
      midCycle: 'FULL',
      sibling: null,
      autoApplyCredit: true,
      lateFee: null,
      generateDaysBefore: 5,
      dueDay: 10,
    }),
});
export type FinanceSettings = z.infer<typeof FinanceSettingsSchema>;

export const FinanceSettingsResponseSchema = z.object({
  settings: FinanceSettingsSchema,
  version: z.number().int(),
  /** `upi://pay?...` without an amount, for the QR preview; null without a UPI ID. */
  upiPreview: z.string().nullable(),
  /** Online gateway (Phase G): always "not connected" until an account is verified. */
  gateway: z.object({ connected: z.boolean(), provider: z.string().nullable() }),
  /** Prefixes already used this fiscal year can't change (C-142). */
  prefixesLocked: z.object({ INVOICE: z.boolean(), RECEIPT: z.boolean() }),
});
export type FinanceSettingsResponse = z.infer<typeof FinanceSettingsResponseSchema>;

/** Change one or more sections; each given section replaces the stored one. */
export const UpdateFinanceSettingsSchema = z.object({
  version: Version,
  upi: FinanceSettingsSchema.shape.upi.optional(),
  bank: FinanceSettingsSchema.shape.bank.optional(),
  methods: FinanceSettingsSchema.shape.methods.optional(),
  tax: FinanceSettingsSchema.shape.tax.optional(),
  prefixes: FinanceSettingsSchema.shape.prefixes.optional(),
  policy: FinanceSettingsSchema.shape.policy.optional(),
});
export type UpdateFinanceSettings = z.infer<typeof UpdateFinanceSettingsSchema>;

/**
 * The UPI deep link (ADR-038): `upi://pay?pa=…&pn=…&am=…&cu=INR&tn=…`. The QR encodes the same
 * string; no external API. Shared by the server (invoices) and the web (QR preview).
 */
export function upiLink(input: {
  vpa: string;
  payeeName: string;
  amountMinor?: number | undefined;
  note?: string | undefined;
}): string {
  const params = new URLSearchParams({ pa: input.vpa, pn: input.payeeName });
  if (input.amountMinor !== undefined) params.set('am', (input.amountMinor / 100).toFixed(2));
  params.set('cu', 'INR');
  if (input.note) params.set('tn', input.note.slice(0, 50));
  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`;
}

// ── Invoices (ARCHITECTURE §12.1, C-19, C-138, C-141, C-142) ───────────────────────────────

export const INVOICE_STATUSES = [
  'DRAFT',
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED',
  'WRITTEN_OFF',
] as const;
export const InvoiceStatusSchema = z.enum(INVOICE_STATUSES);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;
export const INVOICE_KINDS = [
  'REGULAR',
  'ONE_TIME',
  'OPENING_BALANCE',
  'LATE_FEE',
  'INSTALMENT',
] as const;
export const InvoiceKindSchema = z.enum(INVOICE_KINDS);

export const InvoiceLineSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['CHARGE', 'DISCOUNT', 'TAX']),
  label: z.string(),
  quantity: z.number().int(),
  unitMinor: z.number().int(),
  /** Signed: discounts negative. */
  amountMinor: z.number().int(),
  taxable: z.boolean(),
});

export const InvoiceSummarySchema = z.object({
  id: z.uuid(),
  number: z.string().nullable(),
  kind: InvoiceKindSchema,
  status: InvoiceStatusSchema,
  studentId: z.uuid(),
  studentName: z.string(),
  issueDate: CalendarDateSchema.nullable(),
  dueDate: CalendarDateSchema,
  cycleStart: CalendarDateSchema.nullable(),
  cycleEnd: CalendarDateSchema.nullable(),
  currency: CurrencySchema,
  totalMinor: z.number().int(),
  paidMinor: z.number().int(),
  creditAppliedMinor: z.number().int(),
  writtenOffMinor: z.number().int(),
  balanceMinor: z.number().int(),
  /** C-19: derived — open, past due (academy-local), with a balance. */
  overdue: z.boolean(),
  version: z.number().int(),
});
export type InvoiceSummary = z.infer<typeof InvoiceSummarySchema>;

export const InvoiceSchema = InvoiceSummarySchema.extend({
  assignmentId: z.uuid().nullable(),
  forInvoiceId: z.uuid().nullable(),
  instalmentNo: z.number().int().nullable(),
  instalmentOf: z.number().int().nullable(),
  subtotalMinor: z.number().int(),
  discountMinor: z.number().int(),
  taxMinor: z.number().int(),
  overdueSince: CalendarDateSchema.nullable(),
  note: z.string().nullable(),
  closeReason: z.string().nullable(),
  lines: z.array(InvoiceLineSchema),
  createdAt: z.iso.datetime(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const InvoicePageSchema = z.object({
  items: z.array(InvoiceSummarySchema),
  nextCursor: z.string().nullable(),
});
export const InvoiceListQuerySchema = z.object({
  /** OPEN = issued or partly paid; OVERDUE = open and past due. */
  status: z.enum([...INVOICE_STATUSES, 'OPEN', 'OVERDUE']).optional(),
  studentId: z.uuid().optional(),
  kind: InvoiceKindSchema.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const InvoiceChargeInputSchema = z.object({
  label: z.string().trim().min(1).max(200),
  /** Per unit; the line is `quantity × amountMinor`. */
  amountMinor: AmountMinorSchema,
  quantity: z.number().int().min(1).max(999).default(1),
  taxable: z.boolean().default(true),
});
export const InvoiceDiscountInputSchema = z.object({
  label: z.string().trim().min(1).max(200),
  amountMinor: AmountMinorSchema.min(1),
});

/** A manual invoice: one-time fees (admission, kit, exam, event) or a regular one by hand. */
export const CreateInvoiceSchema = z.object({
  studentId: z.uuid(),
  kind: z.enum(['REGULAR', 'ONE_TIME']).default('ONE_TIME'),
  dueDate: CalendarDateSchema,
  charges: z.array(InvoiceChargeInputSchema).min(1).max(30),
  discounts: z.array(InvoiceDiscountInputSchema).max(10).default([]),
  note: z.string().trim().max(500).optional(),
  /** Issue at once (numbered, sent); otherwise it stays a draft. */
  issue: z.boolean().default(false),
});
export type CreateInvoice = z.infer<typeof CreateInvoiceSchema>;

/** Drafts only: replace any part. */
export const UpdateInvoiceSchema = z.object({
  version: Version,
  dueDate: CalendarDateSchema.optional(),
  charges: z.array(InvoiceChargeInputSchema).min(1).max(30).optional(),
  discounts: z.array(InvoiceDiscountInputSchema).max(10).optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
export type UpdateInvoice = z.infer<typeof UpdateInvoiceSchema>;

export const InvoiceVersionSchema = z.object({ version: Version });
export const InvoiceVersionQuerySchema = z.object({ version: z.coerce.number().int().min(1) });
/** Cancel (nothing paid) or write off (C-141): a reason is required. */
export const CloseInvoiceSchema = z.object({
  version: Version,
  reason: z.string().trim().min(3).max(500),
});

/** Overdue invoices that have passed the academy's late-fee threshold (C-140). */
export const LateFeeSuggestionSchema = z.object({
  invoice: InvoiceSummarySchema,
  daysOverdue: z.number().int(),
  amountMinor: z.number().int(),
});
export const LateFeeSuggestionListSchema = z.object({
  /** Null when the academy has no late fee set. */
  rule: z.object({ afterDays: z.number().int(), amountMinor: z.number().int() }).nullable(),
  items: z.array(LateFeeSuggestionSchema),
});

// ── What a transfer or status change does to fees (G-27) ─────────────────────────────────

export const FEE_CHANGES = ['ON_HOLD', 'COMPLETED', 'LEFT', 'ACTIVE', 'TRANSFER'] as const;
export const FeeEffectsQuerySchema = z
  .object({
    studentId: z.uuid(),
    change: z.enum(FEE_CHANGES),
    /** When it takes effect; today if left out. */
    date: CalendarDateSchema.optional(),
    /** TRANSFER: the batch being left. */
    fromBatchId: z.uuid().optional(),
  })
  .refine((v) => v.change !== 'TRANSFER' || v.fromBatchId, {
    path: ['fromBatchId'],
    message: 'required_for_transfer',
  });
export type FeeEffectsQuery = z.infer<typeof FeeEffectsQuerySchema>;

/**
 * - `PAUSES`: nothing billed from the next cycle while on hold;
 * - `STOPS`: nothing billed any more;
 * - `RESUMES`: billing restarts, this cycle under the mid-cycle rule;
 * - `SWITCHABLE`: this fee belongs to the batch being left, so it can move to a new plan;
 * - `UNCHANGED`: carries on as it is.
 */
export const FEE_EFFECTS = ['PAUSES', 'STOPS', 'RESUMES', 'SWITCHABLE', 'UNCHANGED'] as const;
export const FeeEffectsSchema = z.object({
  /** Still owed on open invoices: a change never removes it. */
  openBalanceMinor: z.number().int(),
  creditMinor: z.number().int(),
  items: z.array(
    z.object({
      assignmentId: z.uuid(),
      planName: z.string(),
      batchId: z.uuid().nullable(),
      effect: z.enum(FEE_EFFECTS),
      cycleStart: CalendarDateSchema,
      cycleEnd: CalendarDateSchema,
      nextCycleStart: CalendarDateSchema,
      /** Invoiced for the cycle holding the date. */
      billedMinor: z.number().int(),
      /** The share of that billed for the days from the date on. */
      unusedMinor: z.number().int(),
    }),
  ),
});
export type FeeEffects = z.infer<typeof FeeEffectsSchema>;

/**
 * Move a fee to another plan (G-27). `NEXT_CYCLE`: the old plan runs to the end of this cycle.
 * `PRORATE`: the new plan starts on the date, under the mid-cycle rule, and the unused share of
 * what the old plan billed for this cycle becomes credit.
 */
export const SwitchFeeAssignmentSchema = z.object({
  version: Version,
  toPlanId: z.uuid(),
  toBatchId: z.uuid().nullable().optional(),
  date: CalendarDateSchema,
  mode: z.enum(['NEXT_CYCLE', 'PRORATE']),
});
export type SwitchFeeAssignment = z.infer<typeof SwitchFeeAssignmentSchema>;
export const SwitchFeeAssignmentResultSchema = z.object({
  assignment: FeeAssignmentSchema,
  creditedMinor: z.number().int(),
});
export type SwitchFeeAssignmentResult = z.infer<typeof SwitchFeeAssignmentResultSchema>;

// ── Opening balances (G-02) ──────────────────────────────────────────────────────────────

/** Dues from before AcademyBee: one `OPENING_BALANCE` invoice per student, dated the cut-over. */
export const CreateOpeningBalanceSchema = z.object({
  studentId: z.uuid(),
  amountMinor: AmountMinorSchema.min(1),
  /** The cut-over date; today if left out. */
  asOf: CalendarDateSchema.optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
export type CreateOpeningBalance = z.infer<typeof CreateOpeningBalanceSchema>;
export const OPENING_BALANCE_FIELDS = ['admissionNo', 'amount', 'asOf', 'note'] as const;
export type OpeningBalanceField = (typeof OPENING_BALANCE_FIELDS)[number];

// ── Payments (Phase 7 S4; ADR-038, C-150) ──────────────────────────────────────────────────────

export const PAYMENT_SOURCES = ['STAFF_RECORDED', 'PARENT_REPORTED', 'GATEWAY'] as const;
export const PaymentSourceSchema = z.enum(PAYMENT_SOURCES);
export const PAYMENT_STATUSES = [
  'INITIATED',
  'PENDING',
  'CONFIRMED',
  'FAILED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const;
export const PaymentStatusSchema = z.enum(PAYMENT_STATUSES);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

/** A UTR, bank reference or cheque number: spaces dropped and upper-cased, so copies compare equal. */
export const PaymentReferenceSchema = z
  .string()
  .transform((v) => v.replace(/\s+/g, '').toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9/-]{4,80}$/, 'invalid_reference'));

const PaidAmount = AmountMinorSchema.min(1);

const RecordPaymentBase = z.object({
  studentId: z.uuid(),
  amountMinor: PaidAmount,
  /** The day the money came; defaults to today at the academy. */
  paidOn: CalendarDateSchema.optional(),
  /** Invoices it is for, in order; left out = oldest due first. Anything left over is credit. */
  invoiceIds: z.array(z.uuid()).min(1).max(50).optional(),
  note: z.string().trim().max(500).optional(),
});

/** `POST /payments/cash` (`payment.record_cash`). The server confirms it on acceptance. */
export const RecordCashPaymentSchema = RecordPaymentBase;
export type RecordCashPayment = z.infer<typeof RecordCashPaymentSchema>;

/** `POST /payments` (`payment.record_offline`): a cheque waits for clearing, the others confirm. */
export const RecordPaymentSchema = RecordPaymentBase.extend({
  method: z.enum(['UPI', 'BANK_TRANSFER', 'CARD_POS', 'CHEQUE']),
  reference: PaymentReferenceSchema,
  chequeBank: z.string().trim().min(2).max(80).optional(),
  chequeDate: CalendarDateSchema.optional(),
}).superRefine((v, ctx) => {
  if (v.method !== 'CHEQUE') return;
  if (!v.chequeBank) ctx.addIssue({ code: 'custom', path: ['chequeBank'], message: 'required' });
  if (!v.chequeDate) ctx.addIssue({ code: 'custom', path: ['chequeDate'], message: 'required' });
});
export type RecordPayment = z.infer<typeof RecordPaymentSchema>;

export const PaymentSummarySchema = z.object({
  id: z.uuid(),
  studentId: z.uuid(),
  studentName: z.string(),
  method: PaymentMethodSchema,
  source: PaymentSourceSchema,
  status: PaymentStatusSchema,
  amountMinor: z.number().int(),
  refundedMinor: z.number().int(),
  currency: CurrencySchema,
  reference: z.string().nullable(),
  chequeBank: z.string().nullable(),
  chequeDate: CalendarDateSchema.nullable(),
  paidOn: CalendarDateSchema,
  /** Assigned at confirmation, never before. */
  receiptNumber: z.string().nullable(),
  /** The same reference is on a payment of another method (ADR-038): look before confirming. */
  duplicateFlag: z.boolean(),
  hasEvidence: z.boolean(),
  invoiceIds: z.array(z.uuid()),
  note: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  createdAt: z.string(),
  version: z.number().int(),
});
export type PaymentSummary = z.infer<typeof PaymentSummarySchema>;

export const PaymentSchema = PaymentSummarySchema.extend({
  /** What it paid off, net of refunds. */
  allocations: z.array(
    z.object({
      invoiceId: z.uuid(),
      invoiceNumber: z.string().nullable(),
      amountMinor: z.number().int(),
    }),
  ),
  /** The part that became the student's credit, net of refunds. */
  creditMinor: z.number().int(),
  refunds: z.array(
    z.object({
      id: z.uuid(),
      amountMinor: z.number().int(),
      method: PaymentMethodSchema,
      reference: z.string().nullable(),
      reason: z.string(),
      refundedOn: CalendarDateSchema,
    }),
  ),
});
export type Payment = z.infer<typeof PaymentSchema>;

export const PaymentPageSchema = z.object({
  items: z.array(PaymentSummarySchema),
  nextCursor: z.string().nullable(),
});
/** `status=PENDING` is the Verify payments queue, oldest first; other lists are newest first. */
export const PaymentListQuerySchema = z.object({
  status: PaymentStatusSchema.optional(),
  studentId: z.uuid().optional(),
  method: PaymentMethodSchema.optional(),
  source: PaymentSourceSchema.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Confirm a reported payment or clear a cheque (`payment.verify`). */
export const ConfirmPaymentSchema = z.object({ version: Version });
/** Reject a reported payment or bounce a cheque (`payment.verify`). */
export const RejectPaymentSchema = z.object({
  version: Version,
  reason: z.string().trim().min(3).max(500),
  /** Cheques only (G-30): billed as its own invoice; needs `invoice.create` and `invoice.issue`. */
  bounceChargeMinor: PaidAmount.optional(),
});
export type RejectPayment = z.infer<typeof RejectPaymentSchema>;

/** `POST /payments/:id/refund` (`payment.refund`): recorded by hand until Phase G (G-30). */
export const RefundPaymentSchema = z
  .object({
    version: Version,
    amountMinor: PaidAmount,
    method: z.enum(STAFF_METHODS),
    reference: PaymentReferenceSchema.optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .refine((v) => v.method === 'CASH' || v.reference !== undefined, {
    path: ['reference'],
    message: 'required',
  });
export type RefundPayment = z.infer<typeof RefundPaymentSchema>;

export const PaymentEvidenceLinkSchema = z.object({ url: z.string(), expiresAt: z.string() });

/** The parent's "I've paid" (G-30): a UTR for a staff member to check. */
export const ReportPaymentSchema = z.object({
  reference: PaymentReferenceSchema,
  amountMinor: PaidAmount,
  paidOn: CalendarDateSchema.optional(),
});
export type ReportPayment = z.infer<typeof ReportPaymentSchema>;
/** The parent sees "Awaiting academy confirmation" while this is PENDING; no receipt yet. */
export const ReportedPaymentSchema = z.object({
  id: z.uuid(),
  invoiceId: z.uuid(),
  status: z.literal('PENDING'),
  amountMinor: z.number().int(),
  currency: CurrencySchema,
  reference: z.string(),
  paidOn: CalendarDateSchema,
  createdAt: z.string(),
});
export type ReportedPayment = z.infer<typeof ReportedPaymentSchema>;

// ── Online payments (Phase 7 S5; G-01, ADR-033, ADR-038, C-155…C-158) ───────────────────────────

/** An academy's gateway account as staff see it: never its credentials or webhook secret. */
export const GatewayAccountSchema = z.object({
  provider: z.string(),
  mode: z.enum(['TEST', 'LIVE']),
  status: z.enum(['PENDING', 'CONNECTED', 'DISABLED']),
  /** Where the gateway sends events; the reference is not a secret. */
  webhookPath: z.string(),
  connectedAt: z.string().nullable(),
});
export type GatewayAccount = z.infer<typeof GatewayAccountSchema>;

/** `POST /hub/academies/:slug/invoices/:id/pay`: the balance unless a smaller amount is given. */
export const StartOnlinePaymentSchema = z.object({ amountMinor: PaidAmount.optional() });
export type StartOnlinePayment = z.infer<typeof StartOnlinePaymentSchema>;
/** The UI says "Payment processing…" from here until the server has confirmed it. */
export const OnlinePaymentStartedSchema = z.object({
  paymentId: z.uuid(),
  status: z.literal('PENDING'),
  amountMinor: z.number().int(),
  currency: CurrencySchema,
  provider: z.string(),
  checkout: z.record(z.string(), z.string()),
});
export type OnlinePaymentStarted = z.infer<typeof OnlinePaymentStartedSchema>;

/** What a parent polls for their own payment, reported or online. */
export const HubPaymentStatusSchema = z.object({
  id: z.uuid(),
  status: PaymentStatusSchema,
  amountMinor: z.number().int(),
  currency: CurrencySchema,
  receiptNumber: z.string().nullable(),
  rejectionReason: z.string().nullable(),
});
export type HubPaymentStatus = z.infer<typeof HubPaymentStatusSchema>;

export const RECONCILIATION_KINDS = [
  'UNKNOWN_ORDER',
  'AMOUNT_MISMATCH',
  'PAID_AFTER_FAILED',
  'STUCK_PENDING',
  'SETTLEMENT_MISMATCH',
] as const;
export const ReconciliationExceptionSchema = z.object({
  id: z.uuid(),
  kind: z.enum(RECONCILIATION_KINDS),
  paymentId: z.uuid().nullable(),
  reference: z.string(),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  status: z.enum(['OPEN', 'RESOLVED']),
  resolution: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ReconciliationException = z.infer<typeof ReconciliationExceptionSchema>;
export const ReconciliationPageSchema = z.object({
  items: z.array(ReconciliationExceptionSchema),
  nextCursor: z.string().nullable(),
});
export const ReconciliationListQuerySchema = z.object({
  status: z.enum(['OPEN', 'RESOLVED']).default('OPEN'),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const ResolveExceptionSchema = z.object({ resolution: z.string().trim().min(3).max(500) });

/**
 * The simulator's checkout (never in production): how it ends, and how the webhook behaves.
 * `NONE` leaves the event undelivered, for the reconciliation job to find (a missed webhook).
 */
export const SimulateCheckoutSchema = z.object({
  outcome: z.enum(['SUCCESS', 'FAILURE']),
  delivery: z.enum(['ONCE', 'TWICE', 'NONE']).default('ONCE'),
});
export type SimulateCheckout = z.infer<typeof SimulateCheckoutSchema>;

// ── Documents and share links (Phase 7 S6; G-18, C-137, C-160) ───────────────────────────────────

export const DocumentLayoutSchema = z.enum(['A4', 'MOBILE']);
export type DocumentLayout = z.infer<typeof DocumentLayoutSchema>;

/** A rendered invoice or receipt. `url` lasts 5 minutes; the UI shows "Preparing…" until READY. */
export const FinanceDocumentSchema = z.object({
  layout: DocumentLayoutSchema,
  status: z.enum(['PENDING', 'READY', 'FAILED']),
  url: z.string().nullable(),
});
export type FinanceDocument = z.infer<typeof FinanceDocumentSchema>;

export const ShareLinkSchema = z.object({
  id: z.uuid(),
  layout: DocumentLayoutSchema,
  expiresAt: z.string(),
  revokedAt: z.string().nullable(),
  openCount: z.number().int(),
  createdAt: z.string(),
});
export type ShareLink = z.infer<typeof ShareLinkSchema>;
export const ShareLinkListSchema = z.object({ items: z.array(ShareLinkSchema) });

/** Only this answer has the link: just its hash is stored. `message` is ready to paste. */
export const CreatedShareLinkSchema = ShareLinkSchema.extend({
  url: z.string(),
  message: z.string(),
});
export type CreatedShareLink = z.infer<typeof CreatedShareLinkSchema>;
