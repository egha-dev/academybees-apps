import { Module } from '@nestjs/common';

import { LegalAcceptedGuard } from './legal-accepted.guard.js';
import { LegalController } from './legal.controller.js';
import { LegalService } from './legal.service.js';

/** Legal documents and acceptance (G-06, ADR-034). */
@Module({
  controllers: [LegalController],
  providers: [LegalService, LegalAcceptedGuard],
  exports: [LegalService, LegalAcceptedGuard],
})
export class LegalModule {}
