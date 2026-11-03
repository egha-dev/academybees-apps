import { Injectable } from '@nestjs/common';

import { DomainError } from '../../../core/errors/domain-error.js';
import type { PaymentProvider, ProviderOrderStatus } from './payment-provider.js';

const notOnline = () =>
  new DomainError('CONFLICT', 'no gateway', [{ path: 'gateway', issue: 'gateway_not_connected' }]);

/**
 * The default (ADR-038): no gateway. Parents pay the academy by UPI or in person and staff record
 * it (G-30), so nothing here moves money, and it has no webhook to believe.
 */
@Injectable()
export class ManualProvider implements PaymentProvider {
  readonly key = 'manual' as const;
  readonly online = false;

  createOrder(): Promise<never> {
    return Promise.reject(notOnline());
  }

  verifyWebhook(): null {
    return null;
  }

  fetchStatus(): Promise<ProviderOrderStatus> {
    return Promise.resolve({
      status: 'UNKNOWN',
      providerPaymentId: null,
      amountMinor: null,
      reason: null,
    });
  }

  refund(): Promise<never> {
    return Promise.reject(notOnline());
  }

  fetchSettlements(): Promise<[]> {
    return Promise.resolve([]);
  }
}
