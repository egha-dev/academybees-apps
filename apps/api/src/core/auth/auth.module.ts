import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { DeviceService } from './device.service.js';
import { keyProviders } from './keys.js';
import { HubService } from './hub.service.js';
import { LoginService } from './login.service.js';
import { MembershipService } from './membership.service.js';
import { MfaPolicyService } from './mfa-policy.service.js';
import { MfaService } from './mfa.service.js';
import { PasswordService } from './password.service.js';
import { SecurityController } from './security.controller.js';
import { SecurityService } from './security.service.js';
import { SessionService } from './session.service.js';

/**
 * Sessions and authentication (Phase 2, ADR-006/007). Imported after TenantModule so the
 * AuthGuard runs after the TenantGuard (global guards run in registration order).
 */
@Global()
@Module({
  controllers: [AuthController, SecurityController],
  providers: [
    ...keyProviders,
    MembershipService,
    MfaPolicyService,
    DeviceService,
    SessionService,
    PasswordService,
    SecurityService,
    HubService,
    MfaService,
    LoginService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [
    MembershipService,
    MfaPolicyService,
    MfaService,
    SessionService,
    ...keyProviders.map((p) => (p as { provide: symbol }).provide),
  ],
})
export class AuthModule {}
