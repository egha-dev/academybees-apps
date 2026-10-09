import {
  AcademyBrandingSchema,
  AcademySettingsSchema,
  ProfileStepSchema,
  UpdateBrandingSchema,
} from '@academybee/contracts';
import { Body, Controller, Delete, Get, HttpCode, Patch, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

import { Can } from '../../core/rbac/can.decorator.js';
import { TenantHost } from '../../core/tenant/host-policy.js';
import { createZodDto, ZodResponse } from '../../core/validation/zod-dto.js';
import { AcademyService } from './academy.service.js';

class UpdateSettingsDto extends createZodDto(
  ProfileStepSchema.extend({ version: z.number().int() }),
) {}
class UpdateBrandingDto extends createZodDto(UpdateBrandingSchema) {}

/**
 * The academy's own settings (UX v1.1 §6): profile, branding (colour, logo, favicon, public
 * profile switch). Owner manages; admins read (ARCHITECTURE §7). On academies that are setting up
 * too, so onboarding's profile step can upload the logo.
 */
@Controller({ path: 'academy', version: '1' })
@TenantHost('SETUP', 'ACTIVE')
export class AcademyController {
  constructor(private readonly academy: AcademyService) {}

  @Get('settings')
  @Can('academy.settings.read')
  @ZodResponse(AcademySettingsSchema)
  settings() {
    return this.academy.settings();
  }

  @Patch('settings')
  @Can('academy.settings.manage')
  @ZodResponse(AcademySettingsSchema)
  updateSettings(@Body() body: UpdateSettingsDto) {
    return this.academy.updateSettings(body);
  }

  @Get('branding')
  @Can('academy.settings.read')
  @ZodResponse(AcademyBrandingSchema)
  branding() {
    return this.academy.branding();
  }

  @Patch('branding')
  @Can('academy.branding.manage')
  @ZodResponse(AcademyBrandingSchema)
  updateBranding(@Body() body: UpdateBrandingDto) {
    return this.academy.updateBranding(body);
  }

  /** The raw image bytes as the body (`Content-Type: image/png|jpeg|webp`), at most 2 MB. */
  @Put('branding/logo')
  @HttpCode(200)
  @Can('academy.branding.manage')
  @ZodResponse(AcademyBrandingSchema)
  uploadLogo(@Req() req: Request) {
    return this.academy.uploadImage('logo', req.body);
  }

  @Put('branding/favicon')
  @HttpCode(200)
  @Can('academy.branding.manage')
  @ZodResponse(AcademyBrandingSchema)
  uploadFavicon(@Req() req: Request) {
    return this.academy.uploadImage('favicon', req.body);
  }

  @Delete('branding/logo')
  @Can('academy.branding.manage')
  @ZodResponse(AcademyBrandingSchema)
  removeLogo() {
    return this.academy.removeImage('logo');
  }

  @Delete('branding/favicon')
  @Can('academy.branding.manage')
  @ZodResponse(AcademyBrandingSchema)
  removeFavicon() {
    return this.academy.removeImage('favicon');
  }
}
