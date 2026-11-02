import { z } from 'zod';

import { CalendarDateSchema } from './students.js';

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

/** A UPI ID (virtual payment address): `name@bank`. */
export const VpaSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9.\-_]{2,256}@[a-z][a-z0-9]{1,63}$/, 'invalid_vpa');
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
