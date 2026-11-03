import { newId } from '@academybee/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Redis } from 'ioredis';
import { z } from 'zod';

import { REDIS } from '../../../core/redis/redis.module.js';
import type {
  PaymentProvider,
  ProviderCredentials,
  ProviderEvent,
  ProviderOrderStatus,
  ProviderSettlement,
} from './payment-provider.js';

export const SIMULATOR_SIGNATURE_HEADER = 'x-simulator-signature';
const ORDER = (id: string) => `simulator:order:${id}`;
const SETTLED = (accountRef: string) => `simulator:settlements:${accountRef}`;
const DAY = 86_400;

const EventSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(['payment.captured', 'payment.failed']),
  orderId: z.string().min(1).max(100),
  providerPaymentId: z.string().max(80).nullable(),
  amountMinor: z.number().int().nullable(),
  reason: z.string().max(200).nullable(),
});
export type SimulatorEvent = z.infer<typeof EventSchema>;

const OrderSchema = z.object({
  accountRef: z.string(),
  amountMinor: z.number().int(),
  status: z.enum(['PENDING', 'PAID', 'FAILED']),
  providerPaymentId: z.string().nullable(),
});

/**
 * A pretend gateway for local, CI, staging and demo (ADR-038, C-155): its "bank" is Redis, it signs
 * events like a real one, and config validation keeps it out of production. It is registered only
 * when `PAYMENT_PROVIDERS` names it, so it can never answer in a deployment that didn't ask.
 */
@Injectable()
export class SimulatorProvider implements PaymentProvider {
  readonly key = 'simulator' as const;
  readonly online = true;

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async createOrder(
    credentials: ProviderCredentials,
    order: { amountMinor: number; currency: string; description: string },
  ) {
    const orderId = `sim_order_${newId()}`;
    await this.redis.set(
      ORDER(orderId),
      JSON.stringify({
        accountRef: credentials.accountRef,
        amountMinor: order.amountMinor,
        status: 'PENDING',
        providerPaymentId: null,
      }),
      'EX',
      7 * DAY,
    );
    return {
      orderId,
      checkout: {
        orderId,
        amountMinor: String(order.amountMinor),
        currency: order.currency,
        description: order.description,
      },
    };
  }

  verifyWebhook(
    webhookSecret: string,
    rawBody: Uint8Array,
    headers: Record<string, string | string[] | undefined>,
  ): ProviderEvent | null {
    const given = headers[SIMULATOR_SIGNATURE_HEADER];
    if (typeof given !== 'string') return null;
    const expected = Buffer.from(SimulatorProvider.sign(webhookSecret, rawBody));
    const actual = Buffer.from(given);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(rawBody).toString('utf8'));
    } catch {
      return null;
    }
    const event = EventSchema.safeParse(parsed);
    if (!event.success) return null;
    return {
      id: event.data.id,
      type: event.data.type === 'payment.captured' ? 'PAID' : 'FAILED',
      orderId: event.data.orderId,
      providerPaymentId: event.data.providerPaymentId,
      amountMinor: event.data.amountMinor,
      reason: event.data.reason,
    };
  }

  async fetchStatus(
    credentials: ProviderCredentials,
    orderId: string,
  ): Promise<ProviderOrderStatus> {
    const order = await this.order(orderId);
    if (order?.accountRef !== credentials.accountRef)
      return { status: 'UNKNOWN', providerPaymentId: null, amountMinor: null, reason: null };
    return {
      status: order.status,
      providerPaymentId: order.providerPaymentId,
      amountMinor: order.amountMinor,
      reason: order.status === 'FAILED' ? 'Simulated failure' : null,
    };
  }

  refund(): Promise<{ refundId: string }> {
    return Promise.resolve({ refundId: `sim_refund_${newId()}` });
  }

  async fetchSettlements(credentials: ProviderCredentials): Promise<ProviderSettlement[]> {
    const lines = await this.redis.lrange(SETTLED(credentials.accountRef), 0, -1);
    return lines.map((l) => JSON.parse(l) as ProviderSettlement);
  }

  // ── The pretend gateway's own side, used only by its checkout ─────────────────────────────────

  private async order(orderId: string) {
    const raw = await this.redis.get(ORDER(orderId));
    return raw ? OrderSchema.parse(JSON.parse(raw)) : null;
  }

  /** The customer finished checkout: the bank's answer is now fixed, and a settlement follows. */
  async complete(orderId: string, outcome: 'SUCCESS' | 'FAILURE'): Promise<SimulatorEvent | null> {
    const order = await this.order(orderId);
    if (!order) return null;
    const paid = outcome === 'SUCCESS';
    const providerPaymentId = paid ? `SIM${newId().replaceAll('-', '').toUpperCase()}` : null;
    await this.redis.set(
      ORDER(orderId),
      JSON.stringify({ ...order, status: paid ? 'PAID' : 'FAILED', providerPaymentId }),
      'EX',
      7 * DAY,
    );
    if (paid)
      await this.redis.rpush(
        SETTLED(order.accountRef),
        JSON.stringify({
          reference: `sim_settle_${newId()}`,
          orderId,
          amountMinor: order.amountMinor,
        } satisfies ProviderSettlement),
      );
    return {
      id: `sim_evt_${newId()}`,
      type: paid ? 'payment.captured' : 'payment.failed',
      orderId,
      providerPaymentId,
      amountMinor: order.amountMinor,
      reason: paid ? null : 'Simulated failure',
    };
  }

  static sign(webhookSecret: string, rawBody: Uint8Array): string {
    return createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  }
}
