import { Module } from '@nestjs/common';

import { PeopleModule } from '../people/index.js';
import { FeeAssignmentsService } from './fee-assignments.service.js';
import { FeePlansService } from './fee-plans.service.js';
import {
  FeeAssignmentsController,
  FeePlansController,
  FinanceSettingsController,
  InvoicesController,
} from './finance.controller.js';
import { FinanceDailyProcessor } from './finance-daily.processor.js';
import { FinanceDailyQueue } from './finance-daily.queue.js';
import { FinanceSettingsService } from './finance-settings.service.js';
import { InvoicesService } from './invoices.service.js';

/**
 * Academy finance (Phase 7; ARCHITECTURE §12, ADR-018, ADR-038): fee plans, assignments and the
 * payment settings now; invoices, payments, documents and the provider layer join in S3–S6.
 */
@Module({
  imports: [PeopleModule],
  controllers: [
    FeePlansController,
    FeeAssignmentsController,
    FinanceSettingsController,
    InvoicesController,
  ],
  providers: [
    FeePlansService,
    FeeAssignmentsService,
    FinanceSettingsService,
    InvoicesService,
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
