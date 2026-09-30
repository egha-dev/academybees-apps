import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AuditService } from './audit.service.js';
import { AuditedInterceptor } from './audited.js';

@Global()
@Module({
  providers: [AuditService, { provide: APP_INTERCEPTOR, useClass: AuditedInterceptor }],
  exports: [AuditService],
})
export class AuditModule {}
