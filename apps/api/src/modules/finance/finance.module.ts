import { Module } from '@nestjs/common';

import { PeopleModule } from '../people/index.js';
import { FeeAssignmentsService } from './fee-assignments.service.js';
import { FeePlansService } from './fee-plans.service.js';
import {
  FeeAssignmentsController,
  FeePlansController,
  FinanceSettingsController,
} from './finance.controller.js';
import { FinanceSettingsService } from './finance-settings.service.js';

/**
 * Academy finance (Phase 7; ARCHITECTURE §12, ADR-018, ADR-038): fee plans, assignments and the
 * payment settings now; invoices, payments, documents and the provider layer join in S3–S6.
 */
@Module({
  imports: [PeopleModule],
  controllers: [FeePlansController, FeeAssignmentsController, FinanceSettingsController],
  providers: [FeePlansService, FeeAssignmentsService, FinanceSettingsService],
  exports: [FeePlansService, FeeAssignmentsService, FinanceSettingsService],
})
export class FinanceModule {}
