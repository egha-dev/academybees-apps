import { createTenantBoundClient, type TenantBoundClient } from '@academybee/database';
import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { API_CONFIG } from '../config/config.module.js';
import type { ApiConfig } from '../config/config.schema.js';
import type { RequestContext } from '../context/request-context.js';

/**
 * The application database client (`ab_app`, ADR-005): tenant-bound. The tenant comes from the
 * request context (resolved from the host by the TenantGuard) and the user from the AuthGuard; the
 * driver sets `app.tenant_id` / `app.user_id` for RLS (C-59), and tenant tables are refused without
 * a tenant. The platform client is provided only
 * by src/platform/**.
 */
export const TENANT_DB = Symbol('TENANT_DB');

@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
  constructor(@Inject(TENANT_DB) private readonly db: TenantBoundClient) {}
  async onApplicationShutdown(): Promise<void> {
    await this.db.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: TENANT_DB,
      inject: [API_CONFIG, ClsService],
      useFactory: (config: ApiConfig, cls: ClsService<RequestContext>) =>
        createTenantBoundClient(
          config.DATABASE_URL,
          () => (cls.isActive() ? cls.get('tenantId') : undefined),
          {
            getUserId: () => (cls.isActive() ? cls.get('userId') : undefined),
            getIdempotencyClaim: () => (cls.isActive() ? cls.get('idempotencyClaim') : undefined),
          },
        ),
    },
    DatabaseShutdown,
  ],
  exports: [TENANT_DB],
})
export class DatabaseModule {}
