import {
  AcceptInvitationResponseSchema,
  AcceptInvitationSchema,
  InvitationPreviewSchema,
} from '@academybee/contracts';
import { Body, Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import { type Response } from 'express';

import { Public } from '../../core/auth/public.decorator.js';
import { createZodDto, ZodResponse } from '../../core/validation/zod-dto.js';
import { InvitationsService } from './invitations.service.js';

class AcceptInvitationDto extends createZodDto(AcceptInvitationSchema) {}

/** The invite link on the academy's subdomain (public: the token is the credential). */
@Controller({ path: 'invitations', version: '1' })
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get(':token')
  @Public()
  @ZodResponse(InvitationPreviewSchema)
  preview(@Param('token') token: string) {
    return this.invitations.preview(token);
  }

  @Post(':token/accept')
  @Public()
  @HttpCode(200)
  @ZodResponse(AcceptInvitationResponseSchema)
  accept(
    @Param('token') token: string,
    @Body() body: AcceptInvitationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.invitations.accept(token, body, res);
  }
}
