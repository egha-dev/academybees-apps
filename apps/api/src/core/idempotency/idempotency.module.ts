import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { IdempotencyStore } from './idempotency.store.js';
import { IdempotencyInterceptor } from './idempotent.js';

@Global()
@Module({
  providers: [IdempotencyStore, { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }],
  exports: [IdempotencyStore],
})
export class IdempotencyModule {}
