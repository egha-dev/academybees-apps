import { Controller, Get } from '@nestjs/common';
import { z } from 'zod';

import { AnyHost } from '../tenant/host-policy.js';
import { ZodResponse } from '../validation/zod-dto.js';
import { FeatureFlagService } from './feature-flag.service.js';

export const FlagsResponseSchema = z.object({ flags: z.record(z.string(), z.boolean()) });

/** Evaluated release flags for the request host's academy (or globally on other hosts). No secrets. */
@Controller({ path: 'flags', version: '1' })
@AnyHost()
export class FlagsController {
  constructor(private readonly flags: FeatureFlagService) {}

  @Get()
  @ZodResponse(FlagsResponseSchema)
  async list() {
    return { flags: await this.flags.evaluateAll() };
  }
}
