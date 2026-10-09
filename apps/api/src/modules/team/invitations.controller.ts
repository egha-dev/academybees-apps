import {
  AcceptInvitationResponseSchema,
  AcceptInvitationSchema,
  InvitationPreviewSchema,
  InvitationTokenSchema,
} from '@academybee/contracts';
import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';

import { Public } from '../../core/auth/public.decorator.js';
import { createZodDto, ZodResponse } from '../../core/validation/zod-dto.js';
import { InvitationsService } from './invitations.service.js';

class AcceptInvitationDto extends createZodDto(AcceptInvitationSchema) {}
class InvitationTokenDto extends createZodDto(InvitationTokenSchema) {}

/**
 * The invite link on the academy's subdomain (public: the token is the credential). The token is
 * sent in the body, never in the path, so request logs never hold it (review M3, C-83).
 */
@Controller({ path: 'invitations', version: '1' })
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post('preview')
  @Public()
  @HttpCode(200)
  @ZodResponse(InvitationPreviewSchema)
  preview(@Body() body: InvitationTokenDto) {
    return this.invitations.preview(body.token);
  }

  @Post('accept')
  @Public()
  @HttpCode(200)
  @ZodResponse(AcceptInvitationResponseSchema)
  accept(@Body() body: AcceptInvitationDto, @Res({ passthrough: true }) res: Response) {
    const { token, ...input } = body;
    return this.invitations.accept(token, input, res);
  }
}
