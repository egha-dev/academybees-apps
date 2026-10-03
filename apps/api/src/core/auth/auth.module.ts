import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { keyProviders } from './keys.js';
import { MembershipService } from './membership.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';

/**
 * Sessions and authentication (Phase 2, ADR-006/007). Imported after TenantModule so the
 * AuthGuard runs after the TenantGuard (global guards run in registration order).
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    ...keyProviders,
    MembershipService,
    SessionService,
    PasswordService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [
    MembershipService,
    SessionService,
    ...keyProviders.map((p) => (p as { provide: symbol }).provide),
  ],
})
export class AuthModule {}
