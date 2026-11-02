import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  addMonths,
  cycleAt,
  cycleInvoices,
  cycleShare,
  daysInclusive,
  dueCycles,
  dueDateFor,
  instalmentDueDates,
  laterChildren,
} from './cycles.js';

const monthly = { cycle: 'MONTHLY', cycleMonths: null } as const;
const quarterly = { cycle: 'QUARTERLY', cycleMonths: null } as const;
const halfYearly = { cycle: 'HALF_YEARLY', cycleMonths: null } as const;
const annual = { cycle: 'ANNUAL', cycleMonths: null } as const;
const custom = { cycle: 'CUSTOM', cycleMonths: 2 } as const;

describe('billing cycles (C-139)', () => {
  it('lines fixed cycles up with April', () => {
    expect(cycleAt('2026-11-15', monthly, '2026-01-01')).toEqual({
      start: '2026-11-01',
      end: '2026-11-30',
    });
    expect(cycleAt('2026-11-15', quarterly, '2026-01-01')).toEqual({
      start: '2026-10-01',
      end: '2026-12-31',
    });
    expect(cycleAt('2027-02-01', quarterly, '2026-01-01')).toEqual({
      start: '2027-01-01',
      end: '2027-03-31',
    });
    expect(cycleAt('2027-03-31', halfYearly, '2026-01-01')).toEqual({
      start: '2026-10-01',
      end: '2027-03-31',
    });
    expect(cycleAt('2027-03-31', annual, '2026-01-01')).toEqual({
      start: '2026-04-01',
      end: '2027-03-31',
    });
    expect(cycleAt('2027-04-01', annual, '2026-01-01').start).toBe('2027-04-01');
  });

  it('runs custom cycles from the assignment start, across month ends', () => {
    expect(cycleAt('2026-12-30', custom, '2026-10-31')).toEqual({
      start: '2026-10-31',
      end: '2026-12-30',
    });
    expect(cycleAt('2026-12-31', custom, '2026-10-31').start).toBe('2026-12-31');
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
  });

  it('bills the running cycle and the one starting soon, never past ones', () => {
    const base = { rule: monthly, endsOn: null, daysBefore: 5 };
    expect(
      dueCycles({ ...base, startsOn: '2026-01-01', today: '2026-11-15' }).map((c) => c.start),
    ).toEqual(['2026-11-01']);
    expect(
      dueCycles({ ...base, startsOn: '2026-01-01', today: '2026-11-26' }).map((c) => c.start),
    ).toEqual(['2026-11-01', '2026-12-01']);
    // Not started yet: nothing until its cycle is within the window.
    expect(dueCycles({ ...base, startsOn: '2027-03-10', today: '2026-11-15' })).toEqual([]);
    // Ended: nothing after the end date.
    expect(
      dueCycles({ ...base, startsOn: '2026-01-01', endsOn: '2026-11-30', today: '2026-11-26' }).map(
        (c) => c.start,
      ),
    ).toEqual(['2026-11-01']);
    expect(
      dueCycles({ ...base, startsOn: '2026-01-01', endsOn: '2026-10-31', today: '2026-11-26' }),
    ).toEqual([]);
  });

  it('rolls over the fiscal year', () => {
    expect(
      dueCycles({
        rule: quarterly,
        startsOn: '2026-04-01',
        endsOn: null,
        today: '2027-03-28',
        daysBefore: 5,
      }).map((c) => c.start),
    ).toEqual(['2027-01-01', '2027-04-01']);
  });

  it('never makes an invoice due before the student starts or today', () => {
    const cycle = { start: '2026-11-01', end: '2026-11-30' };
    expect(dueDateFor(cycle, 10, '2026-01-01', '2026-10-28')).toBe('2026-11-10');
    expect(dueDateFor(cycle, 10, '2026-11-20', '2026-10-28')).toBe('2026-11-20');
    expect(dueDateFor(cycle, 10, '2026-01-01', '2026-11-15')).toBe('2026-11-15');
  });

  it('spaces instalments through the cycle', () => {
    expect(instalmentDueDates('2026-04-10', { start: '2026-04-01', end: '2026-06-30' }, 3)).toEqual(
      ['2026-04-10', '2026-05-10', '2026-06-10'],
    );
    const tight = instalmentDueDates('2026-11-10', { start: '2026-11-01', end: '2026-11-30' }, 4);
    expect(tight[0]).toBe('2026-11-10');
    expect(tight.every((d) => d <= '2026-11-30')).toBe(true);
    expect(new Set(tight).size).toBe(4);
  });
});

describe('mid-cycle joiners (G-04)', () => {
  const cycle = { start: '2026-11-01', end: '2026-11-30' };
  const share = (
    joined: string,
    rule: Parameters<typeof cycleShare>[0]['rule'],
    sessions = null as { used: number; of: number } | null,
  ) => cycleShare({ cycle, joined, rule, sessions });

  it('applies each rule', () => {
    expect(share('2026-11-16', 'FULL')).toBeNull();
    expect(share('2026-11-16', 'NEXT_CYCLE')).toBe('skip');
    expect(share('2026-11-16', 'PRORATE_DAYS')).toEqual({ used: 15, of: 30 });
    expect(share('2026-11-16', 'PRORATE_SESSIONS', { used: 4, of: 8 })).toEqual({ used: 4, of: 8 });
  });
  it('falls back to days when the batch has no classes to count', () => {
    expect(share('2026-11-16', 'PRORATE_SESSIONS')).toEqual({ used: 15, of: 30 });
    expect(share('2026-11-16', 'PRORATE_SESSIONS', { used: 0, of: 0 })).toEqual({
      used: 15,
      of: 30,
    });
  });
  it('charges in full from the first day of the cycle', () => {
    for (const rule of ['PRORATE_DAYS', 'PRORATE_SESSIONS', 'NEXT_CYCLE'] as const)
      expect(share('2026-11-01', rule)).toBeNull();
  });
  it('counts days inclusively', () => {
    expect(daysInclusive('2026-11-01', '2026-11-30')).toBe(30);
  });
});

describe('a cycle’s invoices (G-04)', () => {
  const components = [
    { name: 'Tuition', amountMinor: 100_000, taxable: true },
    { name: 'Transport', amountMinor: 50_001, taxable: false },
  ];
  const none = { discount: null, label: 'Discount' };
  const sum = (xs: { amountMinor: number }[]) => xs.reduce((a, x) => a + x.amountMinor, 0);

  it('lists each component and discount', () => {
    const [invoice, ...rest] = cycleInvoices({
      components,
      share: null,
      own: { discount: { kind: 'PERCENT', bps: 1000 }, label: 'Scholarship' },
      sibling: { discount: { kind: 'FIXED', minor: 5_000 }, label: 'Sibling' },
      instalments: null,
    });
    expect(rest).toEqual([]);
    expect(invoice!.charges.map((c) => c.amountMinor)).toEqual([100_000, 50_001]);
    expect(invoice!.discounts).toEqual([
      { label: 'Scholarship', amountMinor: 15_000 },
      { label: 'Sibling', amountMinor: 5_000 },
    ]);
  });

  it('prorates half-up per component', () => {
    const [invoice] = cycleInvoices({
      components,
      share: { used: 1, of: 2 },
      own: none,
      sibling: none,
      instalments: null,
    });
    expect(invoice!.charges.map((c) => c.amountMinor)).toEqual([50_000, 25_001]);
  });

  it('makes no invoice when there is nothing to charge', () => {
    expect(
      cycleInvoices({
        components,
        share: { used: 0, of: 8 },
        own: none,
        sibling: none,
        instalments: null,
      }),
    ).toEqual([]);
  });

  it('keeps a full discount whole across instalments', () => {
    const invoices = cycleInvoices({
      components: [
        { name: 'A', amountMinor: 101, taxable: false },
        { name: 'B', amountMinor: 101, taxable: false },
      ],
      share: null,
      own: { discount: { kind: 'PERCENT', bps: 10_000 }, label: 'Scholarship' },
      sibling: none,
      instalments: 2,
    });
    for (const i of invoices) expect(sum(i.discounts)).toBe(sum(i.charges));
  });

  it('instalments and discounts always add back up, and never exceed a charge', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 5_000_000 }), { minLength: 1, maxLength: 5 }),
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 1, max: 12 }),
        (amounts, ownBps, siblingBps, count) => {
          const invoices = cycleInvoices({
            components: amounts.map((amountMinor, i) => ({
              name: `C${i}`,
              amountMinor,
              taxable: true,
            })),
            share: null,
            own: { discount: { kind: 'PERCENT', bps: ownBps }, label: 'Own' },
            sibling: { discount: { kind: 'PERCENT', bps: siblingBps }, label: 'Sibling' },
            instalments: count,
          });
          const gross = amounts.reduce((a, b) => a + b, 0);
          if (gross === 0) return expect(invoices).toEqual([]);
          expect(invoices).toHaveLength(count);
          expect(invoices.reduce((a, i) => a + sum(i.charges), 0)).toBe(gross);
          for (const i of invoices) expect(sum(i.discounts)).toBeLessThanOrEqual(sum(i.charges));
          const own = Math.floor((gross * ownBps * 2 + 10_000) / 20_000);
          expect(
            invoices.reduce(
              (a, i) => a + (i.discounts.find((d) => d.label === 'Own')?.amountMinor ?? 0),
              0,
            ),
          ).toBe(own);
        },
      ),
    );
  });
});

describe('sibling discount (C-138)', () => {
  it('discounts every child after the first of the same parent', () => {
    expect(
      [
        ...laterChildren([
          { parentId: 'p1', studentId: 'younger', admissionDate: '2026-06-01' },
          { parentId: 'p1', studentId: 'elder', admissionDate: '2026-04-01' },
          { parentId: 'p1', studentId: 'third', admissionDate: '2026-07-01' },
          { parentId: 'p2', studentId: 'only', admissionDate: '2026-04-01' },
        ]),
      ].sort(),
    ).toEqual(['third', 'younger']);
  });
});
