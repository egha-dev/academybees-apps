import { Module } from '@nestjs/common';

import { LegalModule } from '../legal/index.js';
import { PeopleModule } from '../people/index.js';
import { SchedulingModule } from '../scheduling/index.js';
import { TeamModule } from '../team/index.js';
import { OnboardingController } from './onboarding.controller.js';
import { OnboardingService } from './onboarding.service.js';

/** Guided setup (UX v1.1 §4–5): orchestrates people and scheduling commands (C-92). */
@Module({
  imports: [LegalModule, PeopleModule, SchedulingModule, TeamModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
