/**
 * Invoice lifecycle (ARCHITECTURE §12.1, C-19, C-141): every change goes through `nextInvoice`,
 * which refuses anything the table doesn't list. Overdue is derived, never a status.
 */
export const INVOICE_STATUSES = [
  'DRAFT',
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED',
  'WRITTEN_OFF',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export type InvoiceEvent =
  /** Numbered and sent (C-142). */
  | 'issue'
  /** Payments, credit or a write-off changed what is settled; the target comes from amounts. */
  | 'settle'
  /** Only with nothing paid; credit used on it goes back to the student. */
  | 'cancel'
  /** C-141: closed with a balance, with a reason. */
  | 'write_off';

const ALLOWED: Record<InvoiceStatus, Partial<Record<InvoiceEvent, readonly InvoiceStatus[]>>> = {
  DRAFT: { issue: ['ISSUED', 'PARTIALLY_PAID', 'PAID'] },
  ISSUED: {
    settle: ['ISSUED', 'PARTIALLY_PAID', 'PAID'],
    cancel: ['CANCELLED'],
    write_off: ['WRITTEN_OFF'],
  },
  PARTIALLY_PAID: {
    settle: ['PARTIALLY_PAID', 'PAID'],
    write_off: ['WRITTEN_OFF'],
  },
  PAID: {},
  CANCELLED: {},
  WRITTEN_OFF: {},
};

/** Where an open invoice stands, from its amounts (issue with credit can settle it at once). */
export function settledStatus(inv: {
  totalMinor: number;
  paidMinor: number;
  creditAppliedMinor: number;
}): 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' {
  const settled = inv.paidMinor + inv.creditAppliedMinor;
  if (settled >= inv.totalMinor) return 'PAID';
  return settled > 0 ? 'PARTIALLY_PAID' : 'ISSUED';
}

/** The status after `event`, or null when the lifecycle doesn't allow it. */
export function nextInvoice(
  from: InvoiceStatus,
  event: InvoiceEvent,
  to: InvoiceStatus,
): InvoiceStatus | null {
  return ALLOWED[from][event]?.includes(to) ? to : null;
}

/** C-19: overdue while open, past the due date (academy-local), with a balance. */
export function isOverdue(
  inv: { status: InvoiceStatus; dueDate: string; balanceMinor: number },
  today: string,
): boolean {
  return (
    (inv.status === 'ISSUED' || inv.status === 'PARTIALLY_PAID') &&
    inv.dueDate < today &&
    inv.balanceMinor > 0
  );
}
