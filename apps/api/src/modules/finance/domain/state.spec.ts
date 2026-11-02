import { describe, expect, it } from 'vitest';

import {
  INVOICE_STATUSES,
  type InvoiceEvent,
  isOverdue,
  nextInvoice,
  settledStatus,
} from './invoice.state.js';
import { fiscalYearOf, formatNumber, isValidPrefix } from './numbering.js';
import {
  afterRefund,
  initialStatus,
  nextPayment,
  PAYMENT_STATUSES,
  type PaymentEvent,
} from './payment.state.js';

describe('invoice lifecycle (ARCHITECTURE §12.1, C-19, C-141)', () => {
  const events: InvoiceEvent[] = ['issue', 'settle', 'cancel', 'write_off'];
  const allowed = new Set([
    'DRAFT issue ISSUED',
    'DRAFT issue PARTIALLY_PAID',
    'DRAFT issue PAID',
    'ISSUED settle ISSUED',
    'ISSUED settle PARTIALLY_PAID',
    'ISSUED settle PAID',
    'ISSUED cancel CANCELLED',
    'ISSUED write_off WRITTEN_OFF',
    'PARTIALLY_PAID settle PARTIALLY_PAID',
    'PARTIALLY_PAID settle PAID',
    'PARTIALLY_PAID cancel CANCELLED',
    'PARTIALLY_PAID write_off WRITTEN_OFF',
    'PAID cancel CANCELLED',
  ]);
  it('allows exactly the listed transitions (every combination checked)', () => {
    for (const from of INVOICE_STATUSES)
      for (const event of events)
        for (const to of INVOICE_STATUSES)
          expect(nextInvoice(from, event, to), `${from} ${event} ${to}`).toBe(
            allowed.has(`${from} ${event} ${to}`) ? to : null,
          );
  });
  it('cancelled and written-off invoices are final', () => {
    for (const from of ['CANCELLED', 'WRITTEN_OFF'] as const)
      for (const event of events)
        for (const to of INVOICE_STATUSES) expect(nextInvoice(from, event, to)).toBeNull();
  });
  it('settles from amounts; overdue is derived', () => {
    expect(settledStatus({ totalMinor: 100, paidMinor: 0, creditAppliedMinor: 0 })).toBe('ISSUED');
    expect(settledStatus({ totalMinor: 100, paidMinor: 40, creditAppliedMinor: 0 })).toBe(
      'PARTIALLY_PAID',
    );
    expect(settledStatus({ totalMinor: 100, paidMinor: 60, creditAppliedMinor: 40 })).toBe('PAID');
    expect(settledStatus({ totalMinor: 0, paidMinor: 0, creditAppliedMinor: 0 })).toBe('PAID');
    const inv = { status: 'ISSUED' as const, dueDate: '2026-11-10', balanceMinor: 5 };
    expect(isOverdue(inv, '2026-11-10')).toBe(false);
    expect(isOverdue(inv, '2026-11-11')).toBe(true);
    expect(isOverdue({ ...inv, balanceMinor: 0 }, '2026-12-01')).toBe(false);
    expect(isOverdue({ ...inv, status: 'WRITTEN_OFF' }, '2026-12-01')).toBe(false);
  });
});

describe('payment lifecycle (ARCHITECTURE §12.1, C-18, ADR-038)', () => {
  const events: PaymentEvent[] = ['order_created', 'confirm', 'fail', 'refund'];
  const allowed = new Set([
    'INITIATED order_created PENDING',
    'INITIATED fail FAILED',
    'PENDING confirm CONFIRMED',
    'PENDING fail FAILED',
    'CONFIRMED refund PARTIALLY_REFUNDED',
    'CONFIRMED refund REFUNDED',
    'PARTIALLY_REFUNDED refund PARTIALLY_REFUNDED',
    'PARTIALLY_REFUNDED refund REFUNDED',
  ]);
  it('allows exactly the listed transitions (every combination checked)', () => {
    for (const from of PAYMENT_STATUSES)
      for (const event of events)
        for (const to of PAYMENT_STATUSES)
          expect(nextPayment(from, event, to), `${from} ${event} ${to}`).toBe(
            allowed.has(`${from} ${event} ${to}`) ? to : null,
          );
  });
  it('nothing reported or cheque starts confirmed; staff cash, UPI, bank, card do', () => {
    expect(initialStatus('PARENT_REPORTED', 'UPI')).toBe('PENDING');
    expect(initialStatus('STAFF_RECORDED', 'CHEQUE')).toBe('PENDING');
    expect(initialStatus('GATEWAY', 'ONLINE_GATEWAY')).toBe('INITIATED');
    for (const m of ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD_POS'] as const)
      expect(initialStatus('STAFF_RECORDED', m)).toBe('CONFIRMED');
  });
  it('refunds never exceed the payment', () => {
    const p = { status: 'CONFIRMED' as const, amountMinor: 1000, refundedMinor: 0 };
    expect(afterRefund({ ...p, refundMinor: 400 })).toBe('PARTIALLY_REFUNDED');
    expect(afterRefund({ ...p, refundMinor: 1000 })).toBe('REFUNDED');
    expect(afterRefund({ ...p, refundMinor: 1001 })).toBeNull();
    expect(afterRefund({ ...p, refundMinor: 0 })).toBeNull();
    expect(afterRefund({ ...p, status: 'PENDING', refundMinor: 10 })).toBeNull();
    expect(
      afterRefund({
        status: 'PARTIALLY_REFUNDED',
        amountMinor: 1000,
        refundedMinor: 400,
        refundMinor: 600,
      }),
    ).toBe('REFUNDED');
  });
});

describe('numbering (C-142)', () => {
  it('Indian fiscal year April–March', () => {
    expect(fiscalYearOf('2027-03-31')).toBe('2026-27');
    expect(fiscalYearOf('2027-04-01')).toBe('2027-28');
    expect(fiscalYearOf('2026-11-02')).toBe('2026-27');
    expect(fiscalYearOf('2099-12-31')).toBe('2099-00');
  });
  it('formats and validates', () => {
    expect(formatNumber('INV', '2026-27', 42)).toBe('INV/2026-27/00042');
    expect(isValidPrefix('INV')).toBe(true);
    expect(isValidPrefix('inv')).toBe(false);
    expect(isValidPrefix('TOO-LONG-PREFIX')).toBe(false);
  });
});
