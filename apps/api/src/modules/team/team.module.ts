import { Module } from '@nestjs/common';

import { InvitationsController } from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';
import { TeamController } from './team.controller.js';
import { TeamService } from './team.service.js';

/** Team members, roles and staff invitations (Phase 2). */
@Module({
  controllers: [TeamController, InvitationsController],
  providers: [TeamService, InvitationsService],
})
export class TeamModule {}
