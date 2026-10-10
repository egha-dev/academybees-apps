import {
  ApproveJoinRequestSchema,
  CreateJoinRequestSchema,
  currentLegalDocuments,
  JoinRequestListSchema,
  JoinRequestReceivedSchema,
  LinkStartedSchema,
  LinkStartSchema,
  LinkVerifiedSchema,
  LinkVerifySchema,
  ParentInviteSchema,
  PrivacyNoticeSchema,
  RejectJoinRequestSchema,
} from '@academybee/contracts';
import type { TenantBoundClient } from '@academybee/database';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import { Public } from '../../../core/auth/public.decorator.js';
import { TENANT_DB } from '../../../core/database/database.module.js';
import { Idempotent } from '../../../core/idempotency/idempotent.js';
import { Can, SignedIn } from '../../../core/rbac/can.decorator.js';
import { HubHost, TenantHost } from '../../../core/tenant/host-policy.js';
import { createZodDto, ZodResponse } from '../../../core/validation/zod-dto.js';
import { HubLinkService } from './hub-link.service.js';
import { JoinRequestsService } from './join-requests.service.js';
import { ParentAccessService } from './parent-access.service.js';

class LinkStartDto extends createZodDto(LinkStartSchema) {}
class LinkVerifyDto extends createZodDto(LinkVerifySchema) {}
class CreateJoinRequestDto extends createZodDto(CreateJoinRequestSchema) {}
class ApproveDto extends createZodDto(ApproveJoinRequestSchema) {}
class RejectDto extends createZodDto(RejectJoinRequestSchema) {}

const Id = new ParseUUIDPipe({ version: '7' });

/** Inviting a parent to the Family Hub, from Student 360 (C-102). */
@Controller({ path: 'parents', version: '1' })
export class ParentInvitesController {
  constructor(private readonly access: ParentAccessService) {}

  @Post(':id/invite')
  @Can('parent.manage')
  @Idempotent()
  @HttpCode(200)
  @ZodResponse(ParentInviteSchema)
  async invite(@Param('id', Id) id: string) {
    const sent = await this.access.invite(id);
    return { access: 'INVITED' as const, email: sent.email, expiresAt: sent.expiresAt };
  }

  @Post(':id/invite/revoke')
  @Can('parent.manage')
  @HttpCode(204)
  async revoke(@Param('id', Id) id: string): Promise<void> {
    await this.access.revoke(id);
  }
}

/** The academy's Join requests queue (G-31 §3). */
@Controller({ path: 'join-requests', version: '1' })
export class JoinRequestsController {
  constructor(private readonly requests: JoinRequestsService) {}

  @Get()
  @Can('parent.manage')
  @ZodResponse(JoinRequestListSchema)
  list() {
    return this.requests.list();
  }

  @Post(':id/approve')
  @Can('parent.manage')
  @Idempotent()
  @HttpCode(204)
  async approve(@Param('id', Id) id: string, @Body() body: ApproveDto): Promise<void> {
    await this.requests.approve(id, body);
  }

  @Post(':id/reject')
  @Can('parent.manage')
  @HttpCode(204)
  async reject(@Param('id', Id) id: string, @Body() body: RejectDto): Promise<void> {
    await this.requests.reject(id, body.reason);
  }
}

/**
 * Family Hub → academy linking (ADR-039, C-107). Hub host and a hub session only; the academy is
 * named by its address (slug) and resolved on the server — never trusted as an id.
 */
@Controller({ path: 'hub/academies', version: '1' })
@HubHost()
export class HubLinkController {
  constructor(private readonly link: HubLinkService) {}

  @Post(':slug/link/start')
  @SignedIn()
  @HttpCode(202)
  @ZodResponse(LinkStartedSchema)
  start(@Param('slug') slug: string, @Body() body: LinkStartDto) {
    return this.link.start(slug, body.method);
  }

  @Post(':slug/link/verify')
  @SignedIn()
  @HttpCode(200)
  @ZodResponse(LinkVerifiedSchema)
  verify(@Param('slug') slug: string, @Body() body: LinkVerifyDto) {
    return this.link.verify(slug, body);
  }

  @Post(':slug/join-requests')
  @SignedIn()
  @HttpCode(202)
  @ZodResponse(JoinRequestReceivedSchema)
  join(@Param('slug') slug: string, @Body() body: CreateJoinRequestDto) {
    return this.link.joinRequest(slug, body);
  }
}

/**
 * The academy's privacy notice (G-06): public, generated from the AcademyBee template with the
 * academy's name and contact; its version is stored on every consent.
 */
@Controller({ path: 'academy/privacy-notice', version: '1' })
@TenantHost('SETUP', 'ACTIVE')
export class PrivacyNoticeController {
  constructor(@Inject(TENANT_DB) private readonly db: TenantBoundClient) {}

  @Get()
  @Public()
  @ZodResponse(PrivacyNoticeSchema)
  async notice() {
    const [branding, settings] = await Promise.all([
      this.db.tenantBranding.findFirst({ select: { displayName: true } }),
      this.db.tenantSettings.findFirst({ select: { contact: true } }),
    ]);
    const contact = (settings?.contact ?? {}) as Record<string, unknown>;
    const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const template = currentLegalDocuments(new Date()).find(
      (d) => d.kind === 'ACADEMY_PRIVACY_TEMPLATE',
    )!;
    return {
      academy: branding?.displayName ?? '',
      email: text(contact.email),
      phone: text(contact.phone),
      address: text(contact.address),
      version: template.version,
      publishedAt: template.publishedAt,
    };
  }
}
