import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { PermissionGuard } from './permission.guard.js';

/** Capability checks (ADR-008). Imported after AuthModule so it runs after the AuthGuard. */
@Module({ providers: [{ provide: APP_GUARD, useClass: PermissionGuard }] })
export class RbacModule {}
