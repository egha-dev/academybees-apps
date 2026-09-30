import {
  ANALYTICS_EVENTS,
  ANALYTICS_OUTBOX_TYPE,
  AnalyticsOutboxPayloadSchema,
  assertNoPii,
  isAnalyticsEventName,
  parseAnalyticsEvent,
} from '@academybee/contracts';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';

import { WORKER_CONFIG, type WorkerConfig } from '../config/config.js';
import { DomainEventsWorker } from '../events/domain-events.worker.js';
import { ANALYTICS_PORT, type AnalyticsPort, type CapturedEvent } from './analytics.port.js';
import { hashId } from './hash.js';

/**
 * Delivers analytics events relayed from the outbox (i.e. only after the API transaction
 * committed). Re-validates against the registry and the PII guard, hashes tenant/user IDs,
 * then hands the event to the configured adapter.
 */
@Injectable()
export class AnalyticsHandler implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('Analytics');

  constructor(
    private readonly events: DomainEventsWorker,
    @Inject(ANALYTICS_PORT) private readonly port: AnalyticsPort,
    @Inject(WORKER_CONFIG) private readonly config: WorkerConfig,
  ) {}

  onModuleInit(): void {
    this.events.on(ANALYTICS_OUTBOX_TYPE, async (event) => {
      const captured = this.toCaptured(event.payload);
      if (captured) await this.port.capture(captured);
    });
  }

  /** Returns null (and logs) for events that must not be sent; never throws for bad data. */
  toCaptured(payload: unknown): CapturedEvent | null {
    const parsed = AnalyticsOutboxPayloadSchema.safeParse(payload);
    if (!parsed.success || !isAnalyticsEventName(parsed.data.name)) {
      this.logger.warn({ name: parsed.data?.name }, 'Dropped unknown or malformed analytics event');
      return null;
    }
    const { name, tenantId, userId, occurredAt } = parsed.data;
    try {
      const properties = parseAnalyticsEvent(name, parsed.data.properties) as Record<
        string,
        unknown
      >;
      assertNoPii(name, properties);
      const salt = this.config.ANALYTICS_HASH_SALT;
      const academy = tenantId ? hashId(salt, 't', tenantId) : undefined;
      const service = typeof properties.service === 'string' ? properties.service : 'unknown';
      return {
        distinctId: userId ? hashId(salt, 'u', userId) : (academy ?? `system:${service}`),
        event: name,
        properties: {
          ...properties,
          eventVersion: ANALYTICS_EVENTS[name].version,
          appEnv: this.config.APP_ENV,
        },
        ...(academy ? { groups: { academy } } : {}),
        timestamp: new Date(occurredAt),
      };
    } catch (error) {
      this.logger.warn(
        { name, err: (error as Error).message },
        'Dropped analytics event that failed validation',
      );
      return null;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.port.shutdown();
  }
}
