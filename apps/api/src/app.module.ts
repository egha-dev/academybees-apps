import { type DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';

import { AuditModule } from './core/audit/audit.module.js';
import { ConfigModule } from './core/config/config.module.js';
import { type ApiConfig } from './core/config/config.schema.js';
import { ContextModule } from './core/context/context.module.js';
import { DatabaseModule } from './core/database/database.module.js';
import { DocsModule } from './core/docs/docs.module.js';
import { FlagsModule } from './core/flags/flags.module.js';
import { HealthModule } from './core/health/health.module.js';
import { IdempotencyModule } from './core/idempotency/idempotency.module.js';
import { LoggingModule } from './core/logging/logging.module.js';
import { OutboxModule } from './core/outbox/outbox.module.js';
import { RedisModule } from './core/redis/redis.module.js';
import { ZodResponseInterceptor } from './core/validation/zod-response.interceptor.js';
import { ZodValidationPipe } from './core/validation/zod-validation.pipe.js';

/** Root module. Domain modules (src/modules/*) are added by their phases. */
@Module({})
export class AppModule {
  static forRoot(config: ApiConfig, extra: DynamicModule['imports'] = []): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        ContextModule.forRoot(),
        LoggingModule,
        DatabaseModule,
        RedisModule,
        AuditModule,
        OutboxModule,
        IdempotencyModule,
        FlagsModule,
        HealthModule,
        ...(config.APP_ENV === 'production' ? [] : [DocsModule]),
        ...extra,
      ],
      providers: [
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_INTERCEPTOR, useClass: ZodResponseInterceptor },
      ],
    };
  }
}
