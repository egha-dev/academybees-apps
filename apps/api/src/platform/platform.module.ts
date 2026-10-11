import { Module } from '@nestjs/common';

import { AcademiesController } from './academies/academies.controller.js';
import { AcademiesService } from './academies/academies.service.js';
import { OwnerInviteService } from './academies/owner-invite.service.js';
import { ProvisioningService } from './academies/provisioning.service.js';
import { SlugAvailabilityService } from './academies/slug-availability.service.js';
import { SessionGenerationScheduler } from './jobs/session-generation.scheduler.js';
import { PlatformDb } from './platform-db.js';
import { SchedulingModule } from '../modules/scheduling/index.js';

/**
 * Platform (console) modules — the only place the `ab_platform` client is used (ADR-005).
 * Phase 3: the provisioning console slice (C-02); the full console is Phase 14.
 */
@Module({
  imports: [SchedulingModule],
  controllers: [AcademiesController],
  providers: [
    PlatformDb,
    SlugAvailabilityService,
    OwnerInviteService,
    AcademiesService,
    ProvisioningService,
    SessionGenerationScheduler,
  ],
})
export class PlatformModule {}
