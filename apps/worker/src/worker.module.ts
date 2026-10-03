import { maskPii, REDACT_PATHS } from '@academybee/contracts';
import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { AnalyticsHandler } from './analytics/analytics.handler.js';
import { analyticsPortProvider } from './analytics/analytics.module.js';
import { WorkerStartedEmitter } from './analytics/service-started.js';
import { WORKER_CONFIG, type WorkerConfig } from './config/config.js';
import { EmailHandler } from './email/email.handler.js';
import { EMAIL_PORT } from './email/email.port.js';
import { SmtpEmailAdapter } from './email/smtp.adapter.js';
import { DomainEventsWorker } from './events/domain-events.worker.js';
import { OutboxRelayService } from './platform/outbox-relay.service.js';
import { redisProvider, RedisShutdown } from './queues/redis.provider.js';
import { SystemQueueService } from './system/heartbeat.js';

@Module({})
export class WorkerModule {
  static forRoot(config: WorkerConfig): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            level: config.LOG_LEVEL,
            redact: { paths: REDACT_PATHS, censor: '[redacted]' },
            formatters: { log: (obj: Record<string, unknown>) => maskPii(obj) },
            customProps: () => ({ appEnv: config.APP_ENV, service: 'worker' }),
            ...(config.APP_ENV === 'local'
              ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
              : {}),
          },
        }),
      ],
      providers: [
        { provide: WORKER_CONFIG, useValue: Object.freeze(config) },
        redisProvider,
        RedisShutdown,
        SystemQueueService,
        DomainEventsWorker,
        OutboxRelayService,
        analyticsPortProvider,
        AnalyticsHandler,
        {
          provide: EMAIL_PORT,
          useFactory: () => new SmtpEmailAdapter(config.SMTP_URL, config.EMAIL_FROM),
        },
        EmailHandler,
        WorkerStartedEmitter,
      ],
      exports: [DomainEventsWorker],
    };
  }
}
