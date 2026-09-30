import { Controller, Get } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';

import { type RequestContext } from '../context/request-context.js';
import { ZodResponse } from '../validation/zod-dto.js';
import { FeatureFlagService } from './feature-flag.service.js';

export const FlagsResponseSchema = z.object({ flags: z.record(z.string(), z.boolean()) });

/** Evaluated release flags for the current context (tenant from Phase 1). Contains no secrets. */
@Controller({ path: 'flags', version: '1' })
export class FlagsController {
  constructor(
    private readonly flags: FeatureFlagService,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  @Get()
  @ZodResponse(FlagsResponseSchema)
  async list() {
    return { flags: await this.flags.evaluateAll(this.cls.get('tenantId')) };
  }
}
