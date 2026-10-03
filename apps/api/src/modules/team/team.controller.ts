import {
  CreateInvitationSchema,
  CursorPageQuerySchema,
  InvitationListSchema,
  InvitationSchema,
  RoleListSchema,
  TeamMemberPageSchema,
  TeamMemberSchema,
  UpdateTeamMemberSchema,
} from '@academybee/contracts';
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';

import { Idempotent } from '../../core/idempotency/idempotent.js';
import { Can } from '../../core/rbac/can.decorator.js';
import { createZodDto, ZodResponse } from '../../core/validation/zod-dto.js';
import { InvitationsService } from './invitations.service.js';
import { TeamService } from './team.service.js';

class PageQueryDto extends createZodDto(CursorPageQuerySchema) {}
class UpdateMemberDto extends createZodDto(UpdateTeamMemberSchema) {}
class CreateInvitationDto extends createZodDto(CreateInvitationSchema) {}

/** The academy team: members, roles and staff invitations (Phase 2, C-67). */
@Controller({ path: 'team', version: '1' })
export class TeamController {
  constructor(
    private readonly team: TeamService,
    private readonly invitations: InvitationsService,
  ) {}

  @Get('members')
  @Can('team.read')
  @ZodResponse(TeamMemberPageSchema)
  members(@Query() query: PageQueryDto) {
    return this.team.list(query);
  }

  @Patch('members/:id')
  @Can('team.manage')
  @ZodResponse(TeamMemberSchema)
  updateMember(@Param('id') id: string, @Body() body: UpdateMemberDto) {
    return this.team.update(id, body);
  }

  @Get('roles')
  @Can('team.read')
  @ZodResponse(RoleListSchema)
  roles() {
    return this.team.roles();
  }

  @Get('invitations')
  @Can('team.read')
  @ZodResponse(InvitationListSchema)
  listInvitations() {
    return this.invitations.list();
  }

  @Post('invitations')
  @Can('team.invite')
  @Idempotent()
  @HttpCode(201)
  @ZodResponse(InvitationSchema)
  invite(@Body() body: CreateInvitationDto) {
    return this.invitations.create(body);
  }

  @Post('invitations/:id/resend')
  @Can('team.invite')
  @HttpCode(200)
  @ZodResponse(InvitationSchema)
  resend(@Param('id') id: string) {
    return this.invitations.resend(id);
  }

  @Post('invitations/:id/revoke')
  @Can('team.invite')
  @HttpCode(204)
  async revoke(@Param('id') id: string): Promise<void> {
    await this.invitations.revoke(id);
  }
}
