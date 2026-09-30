import {
  ANALYTICS_EVENTS,
  ANALYTICS_OUTBOX_TYPE,
  type AnalyticsEventName,
  type AnalyticsEventProperties,
  type AnalyticsOutboxPayload,
  assertNoPii,
  parseAnalyticsEvent,
} from '@academybee/contracts';
import { type TransactionClient } from '@academybee/database';
import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { type RequestContext } from '../context/request-context.js';
import { OutboxService } from '../outbox/outbox.service.js';

/**
 * Product analytics (ADR-032, G-09) — the API side of the AnalyticsPort. Events are validated
 * against the registry and the PII guard here (fail fast in development and tests), then
 * written to the outbox in the caller's transaction so they are emitted only after commit.
 * The worker delivers them (no-op adapter, or PostHog when configured).
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly outbox: OutboxService,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  async track<N extends AnalyticsEventName>(
    tx: TransactionClient,
    name: N,
    properties: AnalyticsEventProperties<N>,
  ): Promise<void> {
    const parsed = parseAnalyticsEvent(name, properties) as Record<string, unknown>;
    assertNoPii(name, parsed);
    const store = this.cls.isActive() ? this.cls.get() : undefined;
    const payload: AnalyticsOutboxPayload = {
      name,
      version: ANALYTICS_EVENTS[name].version,
      properties: parsed,
      tenantId: store?.tenantId ?? null,
      userId: store?.actor?.type === 'USER' ? store.actor.id : null,
      occurredAt: new Date().toISOString(),
    };
    await this.outbox.write(tx, {
      type: ANALYTICS_OUTBOX_TYPE,
      payload: payload as unknown as Record<string, string>,
      tenantId: payload.tenantId,
    });
  }
}
