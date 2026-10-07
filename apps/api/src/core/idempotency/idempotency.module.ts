import { Global, Module } from '@nestjs/common';

import { IdempotencyStore } from './idempotency.store.js';

@Global()
@Module({
  // The interceptor is registered in AppModule, where the interceptor order is fixed (review M2/M3).
  providers: [IdempotencyStore],
  exports: [IdempotencyStore],
})
export class IdempotencyModule {}
