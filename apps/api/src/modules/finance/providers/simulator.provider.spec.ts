import { describe, expect, it } from 'vitest';

import { ManualProvider } from './manual.provider.js';
import type { ProviderKey } from './payment-provider.js';
import { PaymentProviderRegistry } from './provider-registry.js';
import { SIMULATOR_SIGNATURE_HEADER, SimulatorProvider } from './simulator.provider.js';
import type { ApiConfig } from '../../../core/config/config.schema.js';

const sim = new SimulatorProvider({} as never);
const event = {
  id: 'sim_evt_1',
  type: 'payment.captured',
  orderId: 'sim_order_1',
  providerPaymentId: 'SIM1',
  amountMinor: 1000,
  reason: null,
};
const signed = (body: Buffer, secret = 'secret') => ({
  [SIMULATOR_SIGNATURE_HEADER]: SimulatorProvider.sign(secret, body),
});

describe('SimulatorProvider.verifyWebhook', () => {
  const body = Buffer.from(JSON.stringify(event));

  it('accepts a good signature over the exact bytes', () => {
    expect(sim.verifyWebhook('secret', body, signed(body))).toMatchObject({
      id: 'sim_evt_1',
      type: 'PAID',
      orderId: 'sim_order_1',
      amountMinor: 1000,
    });
  });

  it('refuses anything else, without throwing', () => {
    const changed = Buffer.from(JSON.stringify({ ...event, amountMinor: 1 }));
    expect(sim.verifyWebhook('secret', changed, signed(body))).toBeNull();
    expect(sim.verifyWebhook('other', body, signed(body))).toBeNull();
    expect(sim.verifyWebhook('secret', body, {})).toBeNull();
    expect(sim.verifyWebhook('secret', body, { [SIMULATOR_SIGNATURE_HEADER]: 'x' })).toBeNull();
    expect(
      sim.verifyWebhook('secret', body, { [SIMULATOR_SIGNATURE_HEADER]: ['a', 'b'] }),
    ).toBeNull();
    const garbage = Buffer.from('not json');
    expect(sim.verifyWebhook('secret', garbage, signed(garbage))).toBeNull();
    const wrongShape = Buffer.from(JSON.stringify({ id: 'x' }));
    expect(sim.verifyWebhook('secret', wrongShape, signed(wrongShape))).toBeNull();
  });
});

describe('ManualProvider', () => {
  it('takes no money online and believes no webhook', async () => {
    const manual = new ManualProvider();
    expect(manual.online).toBe(false);
    expect(manual.verifyWebhook()).toBeNull();
    await expect(manual.createOrder()).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('PaymentProviderRegistry', () => {
  const registry = (keys: ProviderKey[]) =>
    new PaymentProviderRegistry(
      { PAYMENT_PROVIDERS: keys } as unknown as ApiConfig,
      new ManualProvider(),
      sim,
    );

  it('has only what the deployment names', () => {
    const manualOnly = registry(['manual']);
    expect(manualOnly.get('manual')?.key).toBe('manual');
    expect(manualOnly.get('simulator')).toBeUndefined();
    expect(manualOnly.simulator).toBeUndefined();
    expect(registry(['manual', 'simulator']).get('simulator')).toBe(sim);
    expect(registry(['manual']).get('razorpay')).toBeUndefined();
  });
});
