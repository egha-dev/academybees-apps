import { Inject, Injectable } from '@nestjs/common';

import { API_CONFIG } from '../../../core/config/config.module.js';
import type { ApiConfig } from '../../../core/config/config.schema.js';
import { ManualProvider } from './manual.provider.js';
import type { PaymentProvider } from './payment-provider.js';
import { SimulatorProvider } from './simulator.provider.js';

/** Only the providers this deployment names exist here (ADR-038): `get` is the one way in. */
@Injectable()
export class PaymentProviderRegistry {
  private readonly providers: Map<string, PaymentProvider>;

  constructor(
    @Inject(API_CONFIG) config: ApiConfig,
    manual: ManualProvider,
    private readonly sim: SimulatorProvider,
  ) {
    const all: PaymentProvider[] = [manual, sim];
    this.providers = new Map(
      all.filter((p) => config.PAYMENT_PROVIDERS.includes(p.key)).map((p) => [p.key, p]),
    );
  }

  get(key: string): PaymentProvider | undefined {
    return this.providers.get(key);
  }

  /** The simulator's own side, or undefined wherever it isn't enabled. */
  get simulator(): SimulatorProvider | undefined {
    return this.providers.has('simulator') ? this.sim : undefined;
  }
}
