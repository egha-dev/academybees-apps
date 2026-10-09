import {
  AcademyDetailSchema,
  AcademyListQuerySchema,
  AcademyPageSchema,
  ChangeSubdomainSchema,
  CreateAcademySchema,
  SlugAvailabilityQuerySchema,
  SlugAvailabilitySchema,
  TenantStatusChangeSchema,
  type TenantTransition,
} from '@academybee/contracts';
import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';

import type { RequestContext } from '../../core/context/request-context.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { Idempotent } from '../../core/idempotency/idempotent.js';
import { RATE_RULES, RateLimiter } from '../../core/rate-limit/rate-limiter.service.js';
import { Can } from '../../core/rbac/can.decorator.js';
import { ConsoleHost } from '../../core/tenant/host-policy.js';
import { createZodDto, ZodResponse } from '../../core/validation/zod-dto.js';
import { AcademiesService } from './academies.service.js';
import { ProvisioningService } from './provisioning.service.js';
import { SlugAvailabilityService } from './slug-availability.service.js';

class SlugQueryDto extends createZodDto(SlugAvailabilityQuerySchema) {}
class CreateAcademyDto extends createZodDto(CreateAcademySchema) {}
class ListQueryDto extends createZodDto(AcademyListQuerySchema) {}
class StatusChangeDto extends createZodDto(TenantStatusChangeSchema) {}
class ChangeSubdomainDto extends createZodDto(ChangeSubdomainSchema) {}

/** A malformed id is just an academy that doesn't exist. */
const academyId = (id: string) => {
  if (!z.uuid().safeParse(id).success) throw new DomainError('NOT_FOUND', 'bad id');
  return id;
};

/**
 * Provisioning console (C-02): console host only, CONSOLE sessions with a platform role. Platform
 * code (ADR-005) — no academy context; each service writes the audit trail.
 */
@Controller({ path: 'platform', version: '1' })
@ConsoleHost()
export class AcademiesController {
  constructor(
    private readonly academies: AcademiesService,
    private readonly provisioning: ProvisioningService,
    private readonly slugs: SlugAvailabilityService,
    private readonly rate: RateLimiter,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  @Get('slug-availability')
  @Can('platform.tenant.create')
  @ZodResponse(SlugAvailabilitySchema)
  async slugAvailability(@Query() query: SlugQueryDto) {
    await this.rate.consume(RATE_RULES.slugCheck, this.cls.get('userId') ?? 'unknown');
    return this.slugs.check(query.slug);
  }

  @Post('tenants')
  @HttpCode(201)
  @Can('platform.tenant.create')
  @Idempotent()
  @ZodResponse(AcademyDetailSchema)
  create(@Body() body: CreateAcademyDto) {
    return this.provisioning.provision(body);
  }

  @Get('tenants')
  @Can('platform.tenant.read')
  @ZodResponse(AcademyPageSchema)
  list(@Query() query: ListQueryDto) {
    return this.academies.list(query);
  }

  @Get('tenants/:id')
  @Can('platform.tenant.read')
  @ZodResponse(AcademyDetailSchema)
  detail(@Param('id') id: string) {
    return this.academies.detail(academyId(id));
  }

  @Post('tenants/:id/suspend')
  @HttpCode(200)
  @Can('platform.tenant.suspend')
  @Idempotent()
  @ZodResponse(AcademyDetailSchema)
  suspend(@Param('id') id: string, @Body() body: StatusChangeDto) {
    return this.change(id, 'suspend', body.reason);
  }

  @Post('tenants/:id/reactivate')
  @HttpCode(200)
  @Can('platform.tenant.suspend')
  @Idempotent()
  @ZodResponse(AcademyDetailSchema)
  reactivate(@Param('id') id: string, @Body() body: StatusChangeDto) {
    return this.change(id, 'reactivate', body.reason);
  }

  @Post('tenants/:id/activate')
  @HttpCode(200)
  @Can('platform.tenant.suspend')
  @Idempotent()
  @ZodResponse(AcademyDetailSchema)
  activate(@Param('id') id: string, @Body() body: StatusChangeDto) {
    return this.change(id, 'activate', body.reason);
  }

  @Post('tenants/:id/archive')
  @HttpCode(200)
  @Can('platform.tenant.suspend')
  @Idempotent()
  @ZodResponse(AcademyDetailSchema)
  archive(@Param('id') id: string, @Body() body: StatusChangeDto) {
    return this.change(id, 'archive', body.reason);
  }

  @Post('tenants/:id/domains')
  @HttpCode(200)
  @Can('platform.tenant.domain')
  @Idempotent()
  @ZodResponse(AcademyDetailSchema)
  changeSubdomain(@Param('id') id: string, @Body() body: ChangeSubdomainDto) {
    return this.academies.changeSubdomain(academyId(id), body.slug);
  }

  @Post('tenants/:id/owner-invite/resend')
  @HttpCode(200)
  @Can('platform.tenant.create')
  @Idempotent()
  @ZodResponse(AcademyDetailSchema)
  resendOwnerInvite(@Param('id') id: string) {
    return this.academies.resendOwnerInvite(academyId(id));
  }

  private change(id: string, action: TenantTransition, reason: string) {
    return this.academies.transition(academyId(id), action, reason);
  }
}
