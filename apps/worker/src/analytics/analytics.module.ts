import type { Provider } from '@nestjs/common';

import { WORKER_CONFIG, type WorkerConfig } from '../config/config.js';
import { NoopAnalyticsAdapter, PostHogAnalyticsAdapter } from './adapters.js';
import { ANALYTICS_PORT, type AnalyticsPort } from './analytics.port.js';

/** No-op unless a PostHog key is configured; always no-op in ci (OD-14). */
export const analyticsPortProvider: Provider = {
  provide: ANALYTICS_PORT,
  inject: [WORKER_CONFIG],
  useFactory: (config: WorkerConfig): AnalyticsPort =>
    config.POSTHOG_API_KEY && config.APP_ENV !== 'ci'
      ? new PostHogAnalyticsAdapter(config.POSTHOG_API_KEY, config.POSTHOG_HOST)
      : new NoopAnalyticsAdapter(config.APP_ENV === 'ci'),
};
