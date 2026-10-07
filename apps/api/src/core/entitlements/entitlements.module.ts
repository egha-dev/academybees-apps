import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { EntitlementGuard } from './entitlement.guard.js';
import { EntitlementService } from './entitlement.service.js';

/** Plans and limits (ADR-028). Imported after RbacModule so it runs after the PermissionGuard. */
@Global()
@Module({
  providers: [EntitlementService, { provide: APP_GUARD, useClass: EntitlementGuard }],
  exports: [EntitlementService],
})
export class EntitlementsModule {}
