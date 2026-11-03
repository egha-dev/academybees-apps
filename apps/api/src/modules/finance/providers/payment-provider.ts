/**
 * The gateway seam (ADR-038, §12.3): connecting a real gateway in Phase G is one more adapter.
 * Credentials reach an adapter only as arguments at call time (ADR-033): adapters keep no secrets,
 * and nothing they are given may be logged or returned.
 */
export type ProviderKey = 'manual' | 'simulator';

export type ProviderCredentials = {
  /** The account's address at the gateway. */
  accountRef: string;
  /** Decrypted just for this call. */
  secret: string;
};

/** A verified event: only `verifyWebhook` makes one, after checking the signature. */
export type ProviderEvent = {
  id: string;
  type: 'PAID' | 'FAILED' | 'OTHER';
  orderId: string;
  providerPaymentId: string | null;
  amountMinor: number | null;
  reason: string | null;
};

export type ProviderOrderStatus = {
  status: 'PENDING' | 'PAID' | 'FAILED' | 'UNKNOWN';
  providerPaymentId: string | null;
  amountMinor: number | null;
  reason: string | null;
};

export type ProviderSettlement = {
  reference: string;
  orderId: string;
  amountMinor: number;
};

export interface PaymentProvider {
  readonly key: ProviderKey;
  /** Whether this provider can take a payment online; "Pay online" depends on it (G-01). */
  readonly online: boolean;
  createOrder(
    credentials: ProviderCredentials,
    order: { paymentId: string; amountMinor: number; currency: string; description: string },
  ): Promise<{ orderId: string; checkout: Record<string, string> }>;
  /** The event if the signature over these exact bytes is good, otherwise null. Never throws. */
  verifyWebhook(
    webhookSecret: string,
    rawBody: Uint8Array,
    headers: Record<string, string | string[] | undefined>,
  ): ProviderEvent | null;
  fetchStatus(credentials: ProviderCredentials, orderId: string): Promise<ProviderOrderStatus>;
  refund(
    credentials: ProviderCredentials,
    input: { providerPaymentId: string; amountMinor: number },
  ): Promise<{ refundId: string }>;
  fetchSettlements(credentials: ProviderCredentials, since: Date): Promise<ProviderSettlement[]>;
}
