import { Logger } from '@nestjs/common';
import { PostHog } from 'posthog-node';

import { type AnalyticsPort, type CapturedEvent } from './analytics.port.js';

/** Default adapter: records nothing externally; logs at debug so events are visible in dev. */
export class NoopAnalyticsAdapter implements AnalyticsPort {
  private readonly logger = new Logger('Analytics');
  readonly captured: CapturedEvent[] = [];

  constructor(private readonly keepInMemory = false) {}

  capture(event: CapturedEvent): Promise<void> {
    if (this.keepInMemory) this.captured.push(event);
    this.logger.debug(
      { event: event.event, distinctId: event.distinctId, properties: event.properties },
      'analytics (no-op)',
    );
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

/** PostHog, server-side only, active only when POSTHOG_API_KEY is set and APP_ENV is not ci. */
export class PostHogAnalyticsAdapter implements AnalyticsPort {
  private readonly client: PostHog;

  constructor(apiKey: string, host: string) {
    this.client = new PostHog(apiKey, {
      host,
      flushAt: 20,
      flushInterval: 10_000,
      disableGeoip: true,
    });
  }

  capture(event: CapturedEvent): Promise<void> {
    this.client.capture({
      distinctId: event.distinctId,
      event: event.event,
      properties: { ...event.properties, $process_person_profile: false },
      ...(event.groups ? { groups: event.groups } : {}),
      timestamp: event.timestamp,
    });
    return Promise.resolve();
  }

  async shutdown(): Promise<void> {
    await this.client.shutdown();
  }
}
