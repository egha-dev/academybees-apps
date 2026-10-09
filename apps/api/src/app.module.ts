import { type DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';

import { AnalyticsModule } from './core/analytics/analytics.module.js';
import { AuditModule } from './core/audit/audit.module.js';
import { AuditedInterceptor } from './core/audit/audited.js';
import { AuthModule } from './core/auth/auth.module.js';
import { ConfigModule } from './core/config/config.module.js';
import type { ApiConfig } from './core/config/config.schema.js';
import { ContextModule } from './core/context/context.module.js';
import { DatabaseModule } from './core/database/database.module.js';
import { DocsModule } from './core/docs/docs.module.js';
import { EmailModule } from './core/email/email.module.js';
import { EntitlementsModule } from './core/entitlements/entitlements.module.js';
import { MediaModule } from './core/media/media.module.js';
import { FlagsModule } from './core/flags/flags.module.js';
import { HealthModule } from './core/health/health.module.js';
import { IdempotencyModule } from './core/idempotency/idempotency.module.js';
import { IdempotencyInterceptor } from './core/idempotency/idempotent.js';
import { LoggingModule } from './core/logging/logging.module.js';
import { OutboxModule } from './core/outbox/outbox.module.js';
import { RateLimitModule } from './core/rate-limit/rate-limit.module.js';
import { RbacModule } from './core/rbac/rbac.module.js';
import { RedisModule } from './core/redis/redis.module.js';
import { TenantModule } from './core/tenant/tenant.module.js';
import { ZodResponseInterceptor } from './core/validation/zod-response.interceptor.js';
import { ZodValidationPipe } from './core/validation/zod-validation.pipe.js';
import { AcademyModule } from './modules/academy/academy.module.js';
import { LegalModule } from './modules/legal/legal.module.js';
import { OnboardingModule } from './modules/onboarding/onboarding.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { TeamModule } from './modules/team/team.module.js';
import { PlatformModule } from './platform/platform.module.js';

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
        TenantModule,
        RateLimitModule,
        AuthModule,
        EmailModule,
        MediaModule,
        RbacModule,
        EntitlementsModule,
        AuditModule,
        OutboxModule,
        AnalyticsModule,
        IdempotencyModule,
        FlagsModule,
        HealthModule,
        // Domain modules.
        TeamModule,
        SettingsModule,
        LegalModule,
        OnboardingModule,
        AcademyModule,
        // Platform (console).
        PlatformModule,
        ...(config.APP_ENV === 'production' ? [] : [DocsModule]),
        ...extra,
      ],
      providers: [
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        // Global interceptors run outermost-first in this order (review M2/M3):
        // 1. idempotency — a replay returns before anything else runs (no second audit row) and
        //    the stored body is the one the client got (already filtered by its schema);
        // 2. @Audited — records only real executions;
        // 3. response schema — closest to the handler.
        { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
        { provide: APP_INTERCEPTOR, useClass: AuditedInterceptor },
        { provide: APP_INTERCEPTOR, useClass: ZodResponseInterceptor },
      ],
    };
  }
}
