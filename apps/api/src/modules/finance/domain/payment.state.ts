/**
 * Payment lifecycle (ARCHITECTURE §12.1, C-18, ADR-038). CONFIRMED is reached only by the
 * server: accepting a staff-recorded payment, `payment.verify`, or a verified gateway event —
 * never because a client asked for it (no event here is reachable from a client body).
 */
export const PAYMENT_STATUSES = [
  'INITIATED',
  'PENDING',
  'CONFIRMED',
  'FAILED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type PaymentEvent =
  /** Gateway order created (simulator now, Phase G later). */
  | 'order_created'
  /** Staff verified a reported payment or cleared a cheque; or a verified gateway event. */
  | 'confirm'
  /** Rejected, bounced, or the gateway said it failed. */
  | 'fail'
  /** Money given back, in part or in full. */
  | 'refund';

const ALLOWED: Record<PaymentStatus, Partial<Record<PaymentEvent, readonly PaymentStatus[]>>> = {
  INITIATED: { order_created: ['PENDING'], fail: ['FAILED'] },
  PENDING: { confirm: ['CONFIRMED'], fail: ['FAILED'] },
  CONFIRMED: { refund: ['PARTIALLY_REFUNDED', 'REFUNDED'] },
  PARTIALLY_REFUNDED: { refund: ['PARTIALLY_REFUNDED', 'REFUNDED'] },
  FAILED: {},
  REFUNDED: {},
};

export function nextPayment(
  from: PaymentStatus,
  event: PaymentEvent,
  to: PaymentStatus,
): PaymentStatus | null {
  return ALLOWED[from][event]?.includes(to) ? to : null;
}

/** The status after a refund of `refundMinor`, or null if it would exceed what is left. */
export function afterRefund(p: {
  status: PaymentStatus;
  amountMinor: number;
  refundedMinor: number;
  refundMinor: number;
}): PaymentStatus | null {
  if (p.refundMinor <= 0 || p.refundedMinor + p.refundMinor > p.amountMinor) return null;
  const to = p.refundedMinor + p.refundMinor === p.amountMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
  return nextPayment(p.status, 'refund', to);
}

/**
 * How a newly recorded payment starts (ADR-038): staff-recorded cash, UPI, bank and card are
 * confirmed by the server on acceptance; cheques and anything a parent reports wait as PENDING
 * for `payment.verify`; gateway payments start INITIATED.
 */
export function initialStatus(
  source: 'STAFF_RECORDED' | 'PARENT_REPORTED' | 'GATEWAY',
  method: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD_POS' | 'ONLINE_GATEWAY',
): PaymentStatus {
  if (source === 'GATEWAY') return 'INITIATED';
  if (source === 'PARENT_REPORTED' || method === 'CHEQUE') return 'PENDING';
  return 'CONFIRMED';
}
