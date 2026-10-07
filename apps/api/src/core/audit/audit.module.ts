import { Global, Module } from '@nestjs/common';

import { AuditService } from './audit.service.js';

@Global()
@Module({
  // The interceptor is registered in AppModule, where the interceptor order is fixed (review M2/M3).
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
