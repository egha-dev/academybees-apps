import {
  HubPaymentStatusSchema,
  OnlinePaymentStartedSchema,
  SimulateCheckoutSchema,
  StartOnlinePaymentSchema,
  ConfirmPaymentSchema,
  PaymentEvidenceLinkSchema,
  PaymentListQuerySchema,
  PaymentPageSchema,
  PaymentSchema,
  RecordCashPaymentSchema,
  RecordPaymentSchema,
  RefundPaymentSchema,
  RejectPaymentSchema,
  ReportedPaymentSchema,
  ReportPaymentSchema,
  CloseInvoiceSchema,
  CommitImportSchema,
  CreateFeeAssignmentsSchema,
  CreateOpeningBalanceSchema,
  ImportJobSchema,
  CreateFeePlanSchema,
  CreateInvoiceSchema,
  FeeAssignmentListQuerySchema,
  FeeAssignmentListSchema,
  FeeAssignmentSchema,
  FeeEffectsQuerySchema,
  FeeEffectsSchema,
  FeePlanListQuerySchema,
  FeePlanListSchema,
  FeePlanSchema,
  FinanceSettingsResponseSchema,
  InvoiceListQuerySchema,
  InvoicePageSchema,
  InvoiceSchema,
  InvoiceVersionQuerySchema,
  InvoiceVersionSchema,
  LateFeeSuggestionListSchema,
  SwitchFeeAssignmentResultSchema,
  SwitchFeeAssignmentSchema,
  UpdateFeeAssignmentSchema,
  UpdateFeePlanSchema,
  UpdateInvoiceSchema,
  UpdateFinanceSettingsSchema,
} from '@academybee/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { Idempotent } from '../../core/idempotency/idempotent.js';
import { Can, SignedIn } from '../../core/rbac/can.decorator.js';
import { HubHost } from '../../core/tenant/host-policy.js';
import { createZodDto, ZodResponse } from '../../core/validation/zod-dto.js';
import { FeeAssignmentsService } from './fee-assignments.service.js';
import { FeeEffectsService } from './fee-effects.service.js';
import { OpeningBalancesService } from './opening-balances.service.js';
import { FeePlansService } from './fee-plans.service.js';
import { FinanceSettingsService } from './finance-settings.service.js';
import { HubPaymentsService } from './hub-payments.service.js';
import { InvoicesService } from './invoices.service.js';
import { PaymentsService } from './payments.service.js';

class FeePlanListQueryDto extends createZodDto(FeePlanListQuerySchema) {}
class CreateFeePlanDto extends createZodDto(CreateFeePlanSchema) {}
class UpdateFeePlanDto extends createZodDto(UpdateFeePlanSchema) {}
class FeeAssignmentListQueryDto extends createZodDto(FeeAssignmentListQuerySchema) {}
class CreateFeeAssignmentsDto extends createZodDto(CreateFeeAssignmentsSchema) {}
class UpdateFeeAssignmentDto extends createZodDto(UpdateFeeAssignmentSchema) {}
class CreateOpeningBalanceDto extends createZodDto(CreateOpeningBalanceSchema) {}
class CommitImportDto extends createZodDto(CommitImportSchema) {}
class FeeEffectsQueryDto extends createZodDto(FeeEffectsQuerySchema) {}
class SwitchFeeAssignmentDto extends createZodDto(SwitchFeeAssignmentSchema) {}
class UpdateFinanceSettingsDto extends createZodDto(UpdateFinanceSettingsSchema) {}
class InvoiceListQueryDto extends createZodDto(InvoiceListQuerySchema) {}
class CreateInvoiceDto extends createZodDto(CreateInvoiceSchema) {}
class UpdateInvoiceDto extends createZodDto(UpdateInvoiceSchema) {}
class InvoiceVersionDto extends createZodDto(InvoiceVersionSchema) {}
class CloseInvoiceDto extends createZodDto(CloseInvoiceSchema) {}
class InvoiceVersionQueryDto extends createZodDto(InvoiceVersionQuerySchema) {}
class PaymentListQueryDto extends createZodDto(PaymentListQuerySchema) {}
class RecordCashPaymentDto extends createZodDto(RecordCashPaymentSchema) {}
class RecordPaymentDto extends createZodDto(RecordPaymentSchema) {}
class ConfirmPaymentDto extends createZodDto(ConfirmPaymentSchema) {}
class RejectPaymentDto extends createZodDto(RejectPaymentSchema) {}
class RefundPaymentDto extends createZodDto(RefundPaymentSchema) {}
class ReportPaymentDto extends createZodDto(ReportPaymentSchema) {}
class StartOnlinePaymentDto extends createZodDto(StartOnlinePaymentSchema) {}
class SimulateCheckoutDto extends createZodDto(SimulateCheckoutSchema) {}

const Id = new ParseUUIDPipe({ version: '7' });

/** Fee plans (PRD v2 §19, G-04). */
@Controller({ path: 'fee-plans', version: '1' })
export class FeePlansController {
  constructor(private readonly plans: FeePlansService) {}

  @Get()
  @Can('fee.read')
  @ZodResponse(FeePlanListSchema)
  list(@Query() query: FeePlanListQueryDto) {
    return this.plans.list(query.status);
  }

  @Post()
  @Can('fee.manage')
  @Idempotent()
  @HttpCode(201)
  @ZodResponse(FeePlanSchema)
  create(@Body() body: CreateFeePlanDto) {
    return this.plans.create(body);
  }

  @Get(':id')
  @Can('fee.read')
  @ZodResponse(FeePlanSchema)
  get(@Param('id', Id) id: string) {
    return this.plans.get(id);
  }

  @Patch(':id')
  @Can('fee.manage')
  @ZodResponse(FeePlanSchema)
  update(@Param('id', Id) id: string, @Body() body: UpdateFeePlanDto) {
    return this.plans.update(id, body);
  }
}

/** Students on fee plans (G-04, G-27). */
@Controller({ path: 'fee-assignments', version: '1' })
export class FeeAssignmentsController {
  constructor(
    private readonly assignments: FeeAssignmentsService,
    private readonly effects: FeeEffectsService,
  ) {}

  @Get()
  @Can('fee.read')
  @ZodResponse(FeeAssignmentListSchema)
  list(@Query() query: FeeAssignmentListQueryDto) {
    return this.assignments.list(query);
  }

  @Post()
  @Can('fee.manage')
  @Idempotent()
  @HttpCode(201)
  @ZodResponse(FeeAssignmentListSchema)
  create(@Body() body: CreateFeeAssignmentsDto) {
    return this.assignments.create(body);
  }

  /** What a transfer or status change would do to this student's fees (G-27). */
  @Get('effects')
  @Can('fee.read')
  @ZodResponse(FeeEffectsSchema)
  preview(@Query() query: FeeEffectsQueryDto) {
    return this.effects.preview(query);
  }

  @Get(':id')
  @Can('fee.read')
  @ZodResponse(FeeAssignmentSchema)
  get(@Param('id', Id) id: string) {
    return this.assignments.get(id);
  }

  @Patch(':id')
  @Can('fee.manage')
  @ZodResponse(FeeAssignmentSchema)
  update(@Param('id', Id) id: string, @Body() body: UpdateFeeAssignmentDto) {
    return this.assignments.update(id, body);
  }

  @Post(':id/switch')
  @Can('fee.manage')
  @Idempotent()
  @HttpCode(200)
  @ZodResponse(SwitchFeeAssignmentResultSchema)
  switchPlan(@Param('id', Id) id: string, @Body() body: SwitchFeeAssignmentDto) {
    return this.effects.switchPlan(id, body);
  }
}

/**
 * Settings → Payments (ADR-038). Read by anyone working with fees; changed only by those who
 * manage the academy's settings (owner by default): UPI, bank details, tax and numbering are
 * academy-wide, so a branch-scoped accountant can't change them.
 */
@Controller({ path: 'settings/finance', version: '1' })
export class FinanceSettingsController {
  constructor(private readonly settings: FinanceSettingsService) {}

  @Get()
  @Can('fee.read')
  @ZodResponse(FinanceSettingsResponseSchema)
  get() {
    return this.settings.get();
  }

  @Patch()
  @Can('academy.settings.manage')
  @ZodResponse(FinanceSettingsResponseSchema)
  update(@Body() body: UpdateFinanceSettingsDto) {
    return this.settings.update(body);
  }
}

/** Invoices (ARCHITECTURE §12.1): every change is idempotent, versioned and audited. */
@Controller({ path: 'invoices', version: '1' })
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @Can('invoice.read')
  @ZodResponse(InvoicePageSchema)
  list(@Query() query: InvoiceListQueryDto) {
    return this.invoices.list(query);
  }

  @Post()
  @Can('invoice.create')
  @Idempotent()
  @HttpCode(201)
  @ZodResponse(InvoiceSchema)
  create(@Body() body: CreateInvoiceDto) {
    return this.invoices.create(body);
  }

  @Get('late-fee-suggestions')
  @Can('invoice.read')
  @ZodResponse(LateFeeSuggestionListSchema)
  lateFeeSuggestions() {
    return this.invoices.lateFeeSuggestions();
  }

  @Get(':id')
  @Can('invoice.read')
  @ZodResponse(InvoiceSchema)
  get(@Param('id', Id) id: string) {
    return this.invoices.get(id);
  }

  @Patch(':id')
  @Can('invoice.create')
  @ZodResponse(InvoiceSchema)
  update(@Param('id', Id) id: string, @Body() body: UpdateInvoiceDto) {
    return this.invoices.update(id, body);
  }

  @Delete(':id')
  @Can('invoice.create')
  @HttpCode(204)
  async remove(@Param('id', Id) id: string, @Query() query: InvoiceVersionQueryDto) {
    await this.invoices.remove(id, query.version);
  }

  @Post(':id/issue')
  @Can('invoice.issue')
  @Idempotent()
  @HttpCode(200)
  @ZodResponse(InvoiceSchema)
  issue(@Param('id', Id) id: string, @Body() body: InvoiceVersionDto) {
    return this.invoices.issue(id, body.version);
  }

  @Post(':id/cancel')
  @Can('invoice.cancel')
  @Idempotent()
  @HttpCode(200)
  @ZodResponse(InvoiceSchema)
  cancel(@Param('id', Id) id: string, @Body() body: CloseInvoiceDto) {
    return this.invoices.cancel(id, body);
  }

  @Post(':id/write-off')
  @Can('invoice.cancel')
  @Idempotent()
  @HttpCode(200)
  @ZodResponse(InvoiceSchema)
  writeOff(@Param('id', Id) id: string, @Body() body: CloseInvoiceDto) {
    return this.invoices.writeOff(id, body);
  }

  /** Staff approve a suggested late fee (C-140): needs both creating and issuing. */
  @Post(':id/late-fee')
  @Can('invoice.issue')
  @Idempotent()
  @HttpCode(201)
  @ZodResponse(InvoiceSchema)
  lateFee(@Param('id', Id) id: string) {
    return this.invoices.applyLateFee(id);
  }
}

/** Dues from before AcademyBee (G-02): one at a time, or from a spreadsheet (ADR-036). */
@Controller({ path: 'opening-balances', version: '1' })
export class OpeningBalancesController {
  constructor(private readonly balances: OpeningBalancesService) {}

  @Post()
  @Can('invoice.create')
  @Idempotent()
  @HttpCode(201)
  @ZodResponse(InvoiceSchema)
  create(@Body() body: CreateOpeningBalanceDto) {
    return this.balances.create(body);
  }

  @Get('import/template')
  @Can('invoice.create')
  template(@Res() res: Response): void {
    res
      .status(200)
      .set({
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="opening-balances-template.csv"',
        'cache-control': 'no-store',
      })
      .send(this.balances.template());
  }

  /** Raw file bytes; the file name travels in `x-file-name` (URI-encoded). */
  @Post('import')
  @Can('invoice.create')
  @Idempotent()
  @HttpCode(201)
  @ZodResponse(ImportJobSchema)
  upload(@Req() req: Request, @Headers('x-file-name') fileName: string | undefined) {
    const bytes = req.body instanceof Uint8Array ? req.body : new Uint8Array();
    let name = 'opening-balances';
    try {
      name = decodeURIComponent(fileName ?? name);
    } catch {
      // keep the default
    }
    return this.balances.upload(bytes, name);
  }

  @Get('import/:id')
  @Can('invoice.create')
  @ZodResponse(ImportJobSchema)
  get(@Param('id', Id) id: string) {
    return this.balances.get(id);
  }

  @Post('import/:id/commit')
  @Can('invoice.create')
  @Idempotent()
  @HttpCode(200)
  @ZodResponse(ImportJobSchema)
  commit(@Param('id', Id) id: string, @Body() body: CommitImportDto) {
    return this.balances.commit(id, body.version);
  }

  /** Rows that weren't imported, with the problem in words (CSV, formula-safe). */
  @Get('import/:id/errors.csv')
  @Can('invoice.create')
  async errors(@Param('id', Id) id: string, @Res() res: Response): Promise<void> {
    const report = await this.balances.errorReport(id);
    res
      .status(200)
      .set({
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(report.fileName)}`,
        'cache-control': 'no-store',
      })
      .send(report.csv);
  }
}

/**
 * Money received (ADR-038). Nothing here takes a status: confirmation is the server's decision
 * on accepting a staff record, or `payment.verify` on a waiting one.
 */
@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @Can('payment.read')
  @ZodResponse(PaymentPageSchema)
  list(@Query() query: PaymentListQueryDto) {
    return this.payments.list(query);
  }

  @Post('cash')
  @Can('payment.record_cash')
  @Idempotent()
  @HttpCode(201)
  @ZodResponse(PaymentSchema)
  recordCash(@Body() body: RecordCashPaymentDto) {
    return this.payments.recordCash(body);
  }

  @Post()
  @Can('payment.record_offline')
  @Idempotent()
  @HttpCode(201)
  @ZodResponse(PaymentSchema)
  record(@Body() body: RecordPaymentDto) {
    return this.payments.record(body);
  }

  @Get(':id')
  @Can('payment.read')
  @ZodResponse(PaymentSchema)
  get(@Param('id', Id) id: string) {
    return this.payments.get(id);
  }

  @Get(':id/evidence')
  @Can('payment.verify')
  @ZodResponse(PaymentEvidenceLinkSchema)
  evidence(@Param('id', Id) id: string) {
    return this.payments.evidenceLink(id);
  }

  @Post(':id/confirm')
  @Can('payment.verify')
  @Idempotent()
  @HttpCode(200)
  @ZodResponse(PaymentSchema)
  confirm(@Param('id', Id) id: string, @Body() body: ConfirmPaymentDto) {
    return this.payments.confirm(id, body.version);
  }

  @Post(':id/reject')
  @Can('payment.verify')
  @Idempotent()
  @HttpCode(200)
  @ZodResponse(PaymentSchema)
  reject(@Param('id', Id) id: string, @Body() body: RejectPaymentDto) {
    return this.payments.reject(id, body);
  }

  @Post(':id/refund')
  @Can('payment.refund')
  @Idempotent()
  @HttpCode(200)
  @ZodResponse(PaymentSchema)
  refund(@Param('id', Id) id: string, @Body() body: RefundPaymentDto) {
    return this.payments.refund(id, body);
  }
}

/** A parent's "I've paid" on the Family Hub (G-30, C-144); behind `p7-hub-payments` until 7P. */
@Controller({ path: 'hub/academies', version: '1' })
@HubHost()
export class HubPaymentsController {
  constructor(private readonly hub: HubPaymentsService) {}

  @Post(':slug/invoices/:id/reported-payments')
  @SignedIn()
  @Idempotent()
  @HttpCode(201)
  @ZodResponse(ReportedPaymentSchema)
  report(@Param('slug') slug: string, @Param('id', Id) id: string, @Body() body: ReportPaymentDto) {
    return this.hub.report(slug, id, body);
  }

  @Post(':slug/invoices/:id/pay')
  @SignedIn()
  @Idempotent()
  @HttpCode(201)
  @ZodResponse(OnlinePaymentStartedSchema)
  pay(
    @Param('slug') slug: string,
    @Param('id', Id) id: string,
    @Body() body: StartOnlinePaymentDto,
  ) {
    return this.hub.payOnline(slug, id, body);
  }

  @Get(':slug/payments/:id')
  @SignedIn()
  @ZodResponse(HubPaymentStatusSchema)
  status(@Param('slug') slug: string, @Param('id', Id) id: string) {
    return this.hub.status(slug, id);
  }

  /** The simulator's checkout page calls this; 404 wherever the simulator isn't enabled. */
  @Post(':slug/payments/:id/simulate-checkout')
  @SignedIn()
  @HttpCode(200)
  @ZodResponse(HubPaymentStatusSchema)
  simulate(
    @Param('slug') slug: string,
    @Param('id', Id) id: string,
    @Body() body: SimulateCheckoutDto,
  ) {
    return this.hub.simulateCheckout(slug, id, body);
  }

  @Put(':slug/reported-payments/:id/evidence')
  @SignedIn()
  @HttpCode(204)
  async evidence(@Param('slug') slug: string, @Param('id', Id) id: string, @Req() req: Request) {
    await this.hub.attachEvidence(slug, id, req.body);
  }
}
