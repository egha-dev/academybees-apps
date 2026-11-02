import { Module } from '@nestjs/common';

import { MediaModule } from '../../core/media/media.module.js';
import { PeopleModule } from '../people/index.js';
import { SchedulingModule } from '../scheduling/index.js';
import { FeeAssignmentsService } from './fee-assignments.service.js';
import { FeeEffectsService } from './fee-effects.service.js';
import { FeePlansService } from './fee-plans.service.js';
import {
  FeeAssignmentsController,
  FeePlansController,
  FinanceSettingsController,
  InvoicesController,
  OpeningBalancesController,
} from './finance.controller.js';
import { FinanceDailyProcessor } from './finance-daily.processor.js';
import { FinanceDailyQueue } from './finance-daily.queue.js';
import { FinanceSettingsService } from './finance-settings.service.js';
import { InvoiceGenerationService } from './invoice-generation.service.js';
import { InvoicesService } from './invoices.service.js';
import { OpeningBalancesProcessor } from './opening-balances.processor.js';
import { OpeningBalancesQueue } from './opening-balances.queue.js';
import { OpeningBalancesService } from './opening-balances.service.js';

/**
 * Academy finance (Phase 7; ARCHITECTURE §12, ADR-018, ADR-038): fee plans, assignments and the
 * payment settings now; invoices, payments, documents and the provider layer join in S3–S6.
 */
@Module({
  imports: [PeopleModule, SchedulingModule, MediaModule],
  controllers: [
    FeePlansController,
    FeeAssignmentsController,
    FinanceSettingsController,
    InvoicesController,
    OpeningBalancesController,
  ],
  providers: [
    FeePlansService,
    FeeAssignmentsService,
    FeeEffectsService,
    FinanceSettingsService,
    InvoicesService,
    InvoiceGenerationService,
    OpeningBalancesService,
    OpeningBalancesQueue,
    OpeningBalancesProcessor,
    FinanceDailyQueue,
    FinanceDailyProcessor,
  ],
  exports: [
    FeePlansService,
    FeeAssignmentsService,
    FinanceSettingsService,
    InvoicesService,
    FinanceDailyQueue,
  ],
})
export class FinanceModule {}
