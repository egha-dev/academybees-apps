/**
 * Academy money maths (ADR-010, G-04, C-140, C-143). Amounts are integer minor units; every
 * rounding is half-up at line level, and totals are sums of lines — never re-rounded totals.
 * Pure functions: no I/O, no dates beyond the counts they are given.
 */

/** `amount × numerator / denominator`, rounded half-up (non-negative inputs). */
export function mulDivHalfUp(amount: number, numerator: number, denominator: number): number {
  if (denominator <= 0) throw new RangeError('denominator must be positive');
  if (amount < 0 || numerator < 0) throw new RangeError('non-negative inputs only');
  // Integer arithmetic: floor((a·n·2 + d) / (2d)) is half-up for non-negative values.
  return Math.floor((amount * numerator * 2 + denominator) / (2 * denominator));
}

/** A percentage in basis points (1000 = 10%) of an amount, half-up. */
export const percentOf = (amount: number, bps: number) => mulDivHalfUp(amount, bps, 10_000);

export type Discount = { kind: 'PERCENT'; bps: number } | { kind: 'FIXED'; minor: number };

/** The discount on an amount, never more than the amount. */
export function discountOn(amount: number, discount: Discount | null | undefined): number {
  if (!discount) return 0;
  const raw = discount.kind === 'PERCENT' ? percentOf(amount, discount.bps) : discount.minor;
  return Math.min(Math.max(raw, 0), amount);
}

/**
 * Split `amount` across `weights` in proportion, by largest remainder, so the parts always
 * add up to `amount` exactly (used to spread a discount over taxable lines).
 */
export function splitByWeights(amount: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0) return weights.map(() => 0);
  const exact = weights.map((w) => (amount * w) / total);
  const parts = exact.map(Math.floor);
  let left = amount - parts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    parts[i]! += 1;
    left -= 1;
  }
  return parts;
}

/** Equal instalments, the remainder on the last (C-140). */
export function splitInstalments(amount: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('count must be ≥ 1');
  const each = Math.floor(amount / count);
  return Array.from({ length: count }, (_, i) =>
    i === count - 1 ? amount - each * (count - 1) : each,
  );
}

/** Mid-cycle joiners (G-04): charge only the share of the cycle that is used, half-up. */
export function prorate(amount: number, used: number, inCycle: number): number {
  if (used >= inCycle) return amount;
  return mulDivHalfUp(amount, Math.max(used, 0), inCycle);
}

export type TaxConfig = { rateBps: number; mode: 'EXCLUSIVE' | 'INCLUSIVE' } | null;

export type ChargeInput = { label: string; amountMinor: number; taxable: boolean };

export type ComputedLine = {
  kind: 'CHARGE' | 'DISCOUNT' | 'TAX';
  label: string;
  amountMinor: number;
  taxable: boolean;
};

export type ComputedInvoice = {
  lines: ComputedLine[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
};

/**
 * An invoice's lines and totals (C-143). Discounts are their own lines (negative); tax is one
 * line computed per taxable charge on its amount net of its share of the discount:
 * - EXCLUSIVE: tax is added on top;
 * - INCLUSIVE: the charges already include tax; the tax is carved out of them, so the parent
 *   pays exactly the listed amounts and the document shows how much of it is tax.
 * `total = subtotal − discount + tax` always holds (the database checks it too).
 */
export function computeInvoice(
  charges: ChargeInput[],
  discounts: { label: string; amountMinor: number }[],
  tax: TaxConfig,
): ComputedInvoice {
  for (const c of charges)
    if (!Number.isInteger(c.amountMinor) || c.amountMinor < 0)
      throw new RangeError('charges are non-negative integers');
  const gross = charges.reduce((a, c) => a + c.amountMinor, 0);
  const wanted = discounts.reduce((a, d) => a + Math.max(d.amountMinor, 0), 0);
  const discount = Math.min(wanted, gross);
  // Each charge's share of the discount (for tax on the net amount).
  const shares = splitByWeights(
    discount,
    charges.map((c) => c.amountMinor),
  );
  const perLineTax = charges.map((c, i) => {
    if (!tax || !c.taxable) return 0;
    const net = c.amountMinor - shares[i]!;
    return tax.mode === 'EXCLUSIVE'
      ? percentOf(net, tax.rateBps)
      : net - mulDivHalfUp(net, 10_000, 10_000 + tax.rateBps);
  });
  const taxMinor = perLineTax.reduce((a, b) => a + b, 0);
  // Inclusive: the listed charges contain the tax, so the net charges carry it as a line.
  const chargeLines: ComputedLine[] = charges.map((c, i) => ({
    kind: 'CHARGE',
    label: c.label,
    amountMinor: tax?.mode === 'INCLUSIVE' ? c.amountMinor - perLineTax[i]! : c.amountMinor,
    taxable: c.taxable,
  }));
  const subtotalMinor = chargeLines.reduce((a, l) => a + l.amountMinor, 0);
  // Discounts apply to the listed (gross) amounts: in inclusive mode the discount reduces the
  // net charges by its net share, keeping total = gross − discount.
  const discountLines: ComputedLine[] = [];
  let left = discount;
  for (const d of discounts) {
    const take = Math.min(Math.max(d.amountMinor, 0), left);
    if (take > 0)
      discountLines.push({ kind: 'DISCOUNT', label: d.label, amountMinor: -take, taxable: false });
    left -= take;
  }
  const lines = [
    ...chargeLines,
    ...discountLines,
    ...(taxMinor > 0
      ? [{ kind: 'TAX' as const, label: 'tax', amountMinor: taxMinor, taxable: false }]
      : []),
  ];
  const totalMinor =
    tax?.mode === 'INCLUSIVE' ? gross - discount : subtotalMinor - discount + taxMinor;
  return {
    lines,
    subtotalMinor,
    discountMinor: discount,
    taxMinor,
    totalMinor,
  };
}

/** What is still owed on an invoice. */
export const balanceOf = (inv: {
  totalMinor: number;
  paidMinor: number;
  creditAppliedMinor: number;
  writtenOffMinor: number;
}) => inv.totalMinor - inv.paidMinor - inv.creditAppliedMinor - inv.writtenOffMinor;

/**
 * Spread a payment over open invoices in the given order (oldest due first by default):
 * never more than each balance; whatever is left is credit (G-04).
 */
export function allocate(
  amountMinor: number,
  invoices: { id: string; balanceMinor: number }[],
): { allocations: { invoiceId: string; amountMinor: number }[]; leftoverMinor: number } {
  let left = amountMinor;
  const allocations: { invoiceId: string; amountMinor: number }[] = [];
  for (const inv of invoices) {
    if (left <= 0) break;
    const take = Math.min(left, Math.max(inv.balanceMinor, 0));
    if (take > 0) {
      allocations.push({ invoiceId: inv.id, amountMinor: take });
      left -= take;
    }
  }
  return { allocations, leftoverMinor: left };
}

/**
 * Where a refund comes from (C-150): first the payment's unused credit, then what it paid on
 * invoices, newest first, which reopens them. `shortMinor` is what can't be sourced because the
 * credit has already been spent.
 */
export function refundSources(
  refundMinor: number,
  creditAvailableMinor: number,
  applied: { invoiceId: string; amountMinor: number }[],
): {
  fromCreditMinor: number;
  reversals: { invoiceId: string; amountMinor: number }[];
  shortMinor: number;
} {
  const fromCreditMinor = Math.min(refundMinor, Math.max(creditAvailableMinor, 0));
  const { allocations, leftoverMinor } = allocate(
    refundMinor - fromCreditMinor,
    applied.map((a) => ({ id: a.invoiceId, balanceMinor: a.amountMinor })),
  );
  return { fromCreditMinor, reversals: allocations, shortMinor: leftoverMinor };
}
