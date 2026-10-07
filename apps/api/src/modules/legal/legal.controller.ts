import { LegalAcceptRequestSchema, LegalCurrentResponseSchema } from '@academybee/contracts';
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';

import { SignedIn } from '../../core/rbac/can.decorator.js';
import { TenantHost } from '../../core/tenant/host-policy.js';
import { createZodDto, ZodResponse } from '../../core/validation/zod-dto.js';
import { LegalService } from './legal.service.js';

class LegalAcceptDto extends createZodDto(LegalAcceptRequestSchema) {}

/**
 * The signed-in user's acceptance of the current Terms, Privacy policy and DPA (G-06, ADR-034).
 * On academy hosts that are setting up or active: the owner accepts before onboarding.
 */
@Controller({ path: 'legal', version: '1' })
@TenantHost('SETUP', 'ACTIVE')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @Get('current')
  @SignedIn()
  @ZodResponse(LegalCurrentResponseSchema)
  current() {
    return this.legal.current();
  }

  @Post('accept')
  @HttpCode(200)
  @SignedIn()
  @ZodResponse(LegalCurrentResponseSchema)
  accept(@Body() body: LegalAcceptDto) {
    return this.legal.accept(body.documentIds);
  }
}
