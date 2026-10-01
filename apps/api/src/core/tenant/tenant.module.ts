import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { TenantContextController } from './tenant-context.controller.js';
import { TenantContext } from './tenant-context.service.js';
import { TenantGuard } from './tenant.guard.js';
import { TenantResolver } from './tenant-resolver.service.js';

/** Tenant resolution and context (Phase 1, ARCHITECTURE §5.2, ADR-003, ADR-005). */
@Global()
@Module({
  controllers: [TenantContextController],
  providers: [TenantContext, TenantResolver, { provide: APP_GUARD, useClass: TenantGuard }],
  exports: [TenantContext, TenantResolver],
})
export class TenantModule {}
