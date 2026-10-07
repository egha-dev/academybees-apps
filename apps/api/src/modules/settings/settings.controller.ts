import {
  SecuritySettingsResponseSchema,
  UpdateSecuritySettingsSchema,
} from '@academybee/contracts';
import { Body, Controller, Get, Patch } from '@nestjs/common';

import { Can } from '../../core/rbac/can.decorator.js';
import { createZodDto, ZodResponse } from '../../core/validation/zod-dto.js';
import { SettingsService } from './settings.service.js';

class UpdateSecuritySettingsDto extends createZodDto(UpdateSecuritySettingsSchema) {}

/** Academy settings (Phase 2: the 2FA rule, G-11). */
@Controller({ path: 'settings', version: '1' })
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('security')
  @Can('academy.settings.read')
  @ZodResponse(SecuritySettingsResponseSchema)
  security() {
    return this.settings.security();
  }

  @Patch('security')
  @Can('academy.settings.manage')
  @ZodResponse(SecuritySettingsResponseSchema)
  updateSecurity(@Body() body: UpdateSecuritySettingsDto) {
    return this.settings.updateSecurity(body);
  }
}
