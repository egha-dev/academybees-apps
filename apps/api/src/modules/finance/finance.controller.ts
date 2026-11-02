import {
  CreateFeeAssignmentsSchema,
  CreateFeePlanSchema,
  FeeAssignmentListQuerySchema,
  FeeAssignmentListSchema,
  FeeAssignmentSchema,
  FeePlanListQuerySchema,
  FeePlanListSchema,
  FeePlanSchema,
  FinanceSettingsResponseSchema,
  UpdateFeeAssignmentSchema,
  UpdateFeePlanSchema,
  UpdateFinanceSettingsSchema,
} from '@academybee/contracts';
import {
  Body,
  Controller,
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

class FeePlanListQueryDto extends createZodDto(FeePlanListQuerySchema) {}
class CreateFeePlanDto extends createZodDto(CreateFeePlanSchema) {}
class UpdateFeePlanDto extends createZodDto(UpdateFeePlanSchema) {}
class FeeAssignmentListQueryDto extends createZodDto(FeeAssignmentListQuerySchema) {}
class CreateFeeAssignmentsDto extends createZodDto(CreateFeeAssignmentsSchema) {}
class UpdateFeeAssignmentDto extends createZodDto(UpdateFeeAssignmentSchema) {}
class UpdateFinanceSettingsDto extends createZodDto(UpdateFinanceSettingsSchema) {}

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
