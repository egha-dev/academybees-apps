import { describe, expect, it } from 'vitest';

import {
  CreateFeeAssignmentsSchema,
  CreateFeePlanSchema,
  FinanceSettingsSchema,
  GstinSchema,
  upiLink,
  VpaSchema,
} from './finance.js';

describe('finance contracts', () => {
  it('settings default to C-139…C-143 (all methods on, no tax, INV/RCT, full charge)', () => {
    expect(FinanceSettingsSchema.parse({})).toEqual({
      upi: null,
      bank: null,
      methods: { CASH: true, UPI: true, BANK_TRANSFER: true, CHEQUE: true, CARD_POS: true },
      tax: null,
      prefixes: { INVOICE: 'INV', RECEIPT: 'RCT' },
      policy: {
        midCycle: 'FULL',
        sibling: null,
        autoApplyCredit: true,
        lateFee: null,
        generateDaysBefore: 5,
        dueDay: 10,
      },
    });
  });

  it('builds the UPI deep link (ADR-038)', () => {
    expect(
      upiLink({
        vpa: 'sunrise@okhdfc',
        payeeName: 'Sunrise Academy',
        amountMinor: 150_050,
        note: 'INV/2026-27/00042',
      }),
    ).toBe(
      'upi://pay?pa=sunrise%40okhdfc&pn=Sunrise%20Academy&am=1500.50&cu=INR&tn=INV%2F2026-27%2F00042',
    );
    expect(upiLink({ vpa: 'a@b', payeeName: 'A' })).toBe('upi://pay?pa=a%40b&pn=A&cu=INR');
  });

  it('validates UPI IDs and GSTINs', () => {
    expect(VpaSchema.parse(' Sunrise.Academy@OKHDFC ')).toBe('sunrise.academy@okhdfc');
    expect(VpaSchema.safeParse('no-at-sign').success).toBe(false);
    expect(GstinSchema.parse('29abcde1234f1z5')).toBe('29ABCDE1234F1Z5');
    expect(GstinSchema.safeParse('29ABCDE1234F1X5').success).toBe(false);
  });

  it('custom cycles need months; assignments need students or a batch', () => {
    const plan = { name: 'P', components: [{ name: 'Tuition', amountMinor: 100 }] };
    expect(CreateFeePlanSchema.safeParse({ ...plan, cycle: 'CUSTOM' }).success).toBe(false);
    expect(
      CreateFeePlanSchema.safeParse({ ...plan, cycle: 'CUSTOM', cycleMonths: 2 }).success,
    ).toBe(true);
    expect(
      CreateFeePlanSchema.safeParse({ ...plan, cycle: 'MONTHLY', cycleMonths: 2 }).success,
    ).toBe(false);
    const terms = { planId: '01a10000-0000-7000-8000-000000000001', startsOn: '2026-11-01' };
    expect(CreateFeeAssignmentsSchema.safeParse(terms).success).toBe(false);
    expect(
      CreateFeeAssignmentsSchema.safeParse({
        ...terms,
        endsOn: '2026-10-01',
        batchId: terms.planId,
      }).success,
    ).toBe(false);
  });
});
