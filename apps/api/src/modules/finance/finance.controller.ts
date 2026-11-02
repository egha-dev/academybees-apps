import {
  CloseInvoiceSchema,
  CreateFeeAssignmentsSchema,
  CreateFeePlanSchema,
  CreateInvoiceSchema,
  FeeAssignmentListQuerySchema,
  FeeAssignmentListSchema,
  FeeAssignmentSchema,
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
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { Idempotent } from '../../core/idempotency/idempotent.js';
import { Can } from '../../core/rbac/can.decorator.js';
import { createZodDto, ZodResponse } from '../../core/validation/zod-dto.js';
import { FeeAssignmentsService } from './fee-assignments.service.js';
import { FeePlansService } from './fee-plans.service.js';
import { FinanceSettingsService } from './finance-settings.service.js';
import { InvoicesService } from './invoices.service.js';

class FeePlanListQueryDto extends createZodDto(FeePlanListQuerySchema) {}
class CreateFeePlanDto extends createZodDto(CreateFeePlanSchema) {}
class UpdateFeePlanDto extends createZodDto(UpdateFeePlanSchema) {}
class FeeAssignmentListQueryDto extends createZodDto(FeeAssignmentListQuerySchema) {}
class CreateFeeAssignmentsDto extends createZodDto(CreateFeeAssignmentsSchema) {}
class UpdateFeeAssignmentDto extends createZodDto(UpdateFeeAssignmentSchema) {}
class UpdateFinanceSettingsDto extends createZodDto(UpdateFinanceSettingsSchema) {}
class InvoiceListQueryDto extends createZodDto(InvoiceListQuerySchema) {}
class CreateInvoiceDto extends createZodDto(CreateInvoiceSchema) {}
class UpdateInvoiceDto extends createZodDto(UpdateInvoiceSchema) {}
class InvoiceVersionDto extends createZodDto(InvoiceVersionSchema) {}
class CloseInvoiceDto extends createZodDto(CloseInvoiceSchema) {}
class InvoiceVersionQueryDto extends createZodDto(InvoiceVersionQuerySchema) {}

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
  constructor(private readonly assignments: FeeAssignmentsService) {}

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
