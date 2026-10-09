import {
  OnboardingStateSchema,
  type SavedStep,
  SavedStepSchema,
  SaveStepRequestSchema,
} from '@academybee/contracts';
import { Body, Controller, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';

import { DomainError } from '../../core/errors/domain-error.js';
import { Idempotent } from '../../core/idempotency/idempotent.js';
import { Can } from '../../core/rbac/can.decorator.js';
import { TenantHost } from '../../core/tenant/host-policy.js';
import { createZodDto, ZodResponse } from '../../core/validation/zod-dto.js';
import { LegalAcceptedGuard } from '../legal/index.js';
import { OnboardingService } from './onboarding.service.js';

class SaveStepDto extends createZodDto(SaveStepRequestSchema) {}

/**
 * The academy's guided setup (UX v1.1 §5, C-85, C-87): the owner (`academy.onboarding.manage`),
 * after accepting the current Terms, Privacy policy and DPA (ADR-034), on an academy that is
 * setting up (or already open, to see what was entered). Online only.
 */
@Controller({ path: 'onboarding', version: '1' })
@TenantHost('SETUP', 'ACTIVE')
@UseGuards(LegalAcceptedGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  @Can('academy.onboarding.manage')
  @ZodResponse(OnboardingStateSchema)
  state() {
    return this.onboarding.state();
  }

  @Put('steps/:step')
  @Can('academy.onboarding.manage')
  @Idempotent()
  @ZodResponse(OnboardingStateSchema)
  save(@Param('step') step: string, @Body() body: SaveStepDto) {
    const parsed = SavedStepSchema.safeParse(step);
    if (!parsed.success) throw new DomainError('NOT_FOUND', 'unknown step');
    return this.onboarding.save(parsed.data as SavedStep, body);
  }

  @Post('complete')
  @HttpCode(200)
  @Can('academy.onboarding.manage')
  @Idempotent()
  @ZodResponse(OnboardingStateSchema)
  complete() {
    return this.onboarding.complete();
  }
}
