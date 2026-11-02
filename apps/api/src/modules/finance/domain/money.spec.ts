import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  allocate,
  balanceOf,
  computeInvoice,
  discountOn,
  mulDivHalfUp,
  percentOf,
  prorate,
  splitByWeights,
  splitInstalments,
} from './money.js';

const amount = fc.integer({ min: 0, max: 50_000_000 });

describe('money (ADR-010: integer minor units, half-up)', () => {
  it('rounds half-up', () => {
    expect(percentOf(1050, 1000)).toBe(105);
    expect(percentOf(5, 1000)).toBe(1); // 0.5 → 1
    expect(percentOf(4, 1000)).toBe(0); // 0.4 → 0
    expect(mulDivHalfUp(100, 1, 3)).toBe(33);
    expect(mulDivHalfUp(200, 1, 3)).toBe(67);
  });

  it('a discount is never more than the amount, never negative', () => {
    fc.assert(
      fc.property(amount, fc.integer({ min: 1, max: 10_000 }), (a, bps) => {
        const d = discountOn(a, { kind: 'PERCENT', bps });
        return d >= 0 && d <= a;
      }),
    );
    expect(discountOn(500, { kind: 'FIXED', minor: 900 })).toBe(500);
    expect(discountOn(500, null)).toBe(0);
  });

  it('splits always add up exactly (largest remainder; instalments)', () => {
    fc.assert(
      fc.property(
        amount,
        fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 1, maxLength: 12 }),
        (a, w) => {
          const parts = splitByWeights(a, w);
          const total = w.reduce((x, y) => x + y, 0);
          return (
            total === 0 || (parts.reduce((x, y) => x + y, 0) === a && parts.every((p) => p >= 0))
          );
        },
      ),
    );
    fc.assert(
      fc.property(amount, fc.integer({ min: 1, max: 12 }), (a, n) => {
        const parts = splitInstalments(a, n);
        return (
          parts.length === n &&
          parts.reduce((x, y) => x + y, 0) === a &&
          parts.slice(0, -1).every((p) => p === parts[0])
        );
      }),
    );
    expect(splitInstalments(100_000, 3)).toEqual([33_333, 33_333, 33_334]);
  });

  it('prorates mid-cycle joiners (G-04)', () => {
    expect(prorate(300_000, 15, 30)).toBe(150_000);
    expect(prorate(100_000, 1, 3)).toBe(33_333);
    expect(prorate(100_000, 31, 30)).toBe(100_000);
    expect(prorate(100_000, 0, 30)).toBe(0);
    fc.assert(
      fc.property(amount, fc.integer({ min: 1, max: 31 }), (a, days) => {
        const p = prorate(a, Math.min(days, 31), 31);
        return p >= 0 && p <= a;
      }),
    );
  });

  it('computes invoices: total = subtotal − discount + tax, never negative', () => {
    const tax = fc.option(
      fc.record({
        rateBps: fc.integer({ min: 0, max: 2800 }),
        mode: fc.constantFrom('EXCLUSIVE' as const, 'INCLUSIVE' as const),
      }),
      { nil: null },
    );
    const charges = fc.array(
      fc.record({ label: fc.constant('x'), amountMinor: amount, taxable: fc.boolean() }),
      { minLength: 1, maxLength: 6 },
    );
    const discounts = fc.array(fc.record({ label: fc.constant('d'), amountMinor: amount }), {
      maxLength: 3,
    });
    fc.assert(
      fc.property(charges, discounts, tax, (c, d, t) => {
        const inv = computeInvoice(c, d, t);
        const lines = inv.lines.reduce((a, l) => a + l.amountMinor, 0);
        return (
          inv.totalMinor === inv.subtotalMinor - inv.discountMinor + inv.taxMinor &&
          inv.totalMinor === lines &&
          inv.totalMinor >= 0 &&
          inv.discountMinor <= c.reduce((a, x) => a + x.amountMinor, 0)
        );
      }),
    );
  });

  it('GST 18%: exclusive adds tax on the discounted amount; inclusive carves it out', () => {
    const tuition = [{ label: 'Tuition', amountMinor: 100_000, taxable: true }];
    const ten = [{ label: 'Sibling', amountMinor: 10_000 }];
    expect(computeInvoice(tuition, ten, { rateBps: 1800, mode: 'EXCLUSIVE' })).toMatchObject({
      subtotalMinor: 100_000,
      discountMinor: 10_000,
      taxMinor: 16_200,
      totalMinor: 106_200,
    });
    const gross = [{ label: 'Tuition', amountMinor: 118_000, taxable: true }];
    const inc = computeInvoice(gross, [], { rateBps: 1800, mode: 'INCLUSIVE' });
    expect(inc).toMatchObject({ subtotalMinor: 100_000, taxMinor: 18_000, totalMinor: 118_000 });
    // No tax: the listed amounts are the invoice.
    expect(computeInvoice(gross, [], null)).toMatchObject({ taxMinor: 0, totalMinor: 118_000 });
  });

  it('allocates oldest first, never beyond a balance; the rest is credit', () => {
    expect(
      allocate(150_000, [
        { id: 'a', balanceMinor: 100_000 },
        { id: 'b', balanceMinor: 30_000 },
        { id: 'c', balanceMinor: 0 },
      ]),
    ).toEqual({
      allocations: [
        { invoiceId: 'a', amountMinor: 100_000 },
        { invoiceId: 'b', amountMinor: 30_000 },
      ],
      leftoverMinor: 20_000,
    });
    fc.assert(
      fc.property(amount, fc.array(amount, { maxLength: 8 }), (a, balances) => {
        const r = allocate(
          a,
          balances.map((b, i) => ({ id: String(i), balanceMinor: b })),
        );
        const used = r.allocations.reduce((x, y) => x + y.amountMinor, 0);
        return (
          used + r.leftoverMinor === a &&
          r.allocations.every((al) => al.amountMinor <= balances[Number(al.invoiceId)]!)
        );
      }),
    );
  });

  it('balance = total − paid − credit − written off', () => {
    expect(
      balanceOf({ totalMinor: 1000, paidMinor: 300, creditAppliedMinor: 200, writtenOffMinor: 0 }),
    ).toBe(500);
  });
});
