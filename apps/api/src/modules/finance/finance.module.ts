import { Module } from '@nestjs/common';

import { MediaModule } from '../../core/media/media.module.js';
import { NotificationsModule } from '../notifications/index.js';
import { PeopleModule } from '../people/index.js';
import { SchedulingModule } from '../scheduling/index.js';
import { FeeAssignmentsService } from './fee-assignments.service.js';
import { FeeEffectsService } from './fee-effects.service.js';
import { FeePlansService } from './fee-plans.service.js';
import {
  FeeAssignmentsController,
  FeePlansController,
  FinanceSettingsController,
  HubPaymentsController,
  InvoicesController,
  OpeningBalancesController,
  PaymentsController,
} from './finance.controller.js';
import { FinanceDailyProcessor } from './finance-daily.processor.js';
import { FinanceDailyQueue } from './finance-daily.queue.js';
import { FinanceSettingsService } from './finance-settings.service.js';
import { HubPaymentsService } from './hub-payments.service.js';
import { InvoiceGenerationService } from './invoice-generation.service.js';
import { InvoicesService } from './invoices.service.js';
import { OpeningBalancesProcessor } from './opening-balances.processor.js';
import { OpeningBalancesQueue } from './opening-balances.queue.js';
import { OpeningBalancesService } from './opening-balances.service.js';
import {
  InvoiceDocumentsController,
  ReceiptDocumentsController,
  ShareLinkController,
} from './documents/documents.controller.js';
import { DocumentsProcessor } from './documents/documents.processor.js';
import { DocumentsQueue } from './documents/documents.queue.js';
import { DocumentsService } from './documents/documents.service.js';
import { PdfRenderer } from './documents/pdf-renderer.js';
import { PaymentAccountsService } from './payment-accounts.service.js';
import { PaymentsService } from './payments.service.js';
import { ManualProvider } from './providers/manual.provider.js';
import { PaymentProviderRegistry } from './providers/provider-registry.js';
import { SimulatorProvider } from './providers/simulator.provider.js';
import { ReconciliationProcessor } from './reconciliation.processor.js';
import { ReconciliationQueue } from './reconciliation.queue.js';
import { ReconciliationService } from './reconciliation.service.js';
import {
  GatewayAccountController,
  PaymentWebhooksController,
  ReconciliationController,
} from './online-payments.controller.js';
import { OnlinePaymentsService } from './online-payments.service.js';

/**
 * Academy finance (Phase 7; ARCHITECTURE §12, ADR-018, ADR-038): fee plans, assignments and the
 * payment settings now; invoices, payments, documents and the provider layer join in S3–S6.
 */
@Module({
  imports: [PeopleModule, SchedulingModule, MediaModule, NotificationsModule],
  controllers: [
    FeePlansController,
    FeeAssignmentsController,
    FinanceSettingsController,
    InvoicesController,
    OpeningBalancesController,
    PaymentsController,
    HubPaymentsController,
    PaymentWebhooksController,
    GatewayAccountController,
    ReconciliationController,
    InvoiceDocumentsController,
    ReceiptDocumentsController,
    ShareLinkController,
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
    PaymentsService,
    HubPaymentsService,
    ManualProvider,
    SimulatorProvider,
    PaymentProviderRegistry,
    PaymentAccountsService,
    OnlinePaymentsService,
    ReconciliationService,
    ReconciliationQueue,
    ReconciliationProcessor,
    DocumentsService,
    DocumentsQueue,
    DocumentsProcessor,
    PdfRenderer,
  ],
  exports: [
    FeePlansService,
    FeeAssignmentsService,
    FinanceSettingsService,
    InvoicesService,
    PaymentsService,
    FinanceDailyQueue,
    ReconciliationQueue,
  ],
})
export class FinanceModule {}
