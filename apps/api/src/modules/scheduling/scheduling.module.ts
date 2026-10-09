import { Module } from '@nestjs/common';

import { SchedulingService } from './scheduling.service.js';

/**
 * Scheduling (C-09, ADR-024): Phase 3 has the commands onboarding needs; Phase 5 adds the
 * timetable workspace, the rolling session job and their endpoints.
 */
@Module({ providers: [SchedulingService], exports: [SchedulingService] })
export class SchedulingModule {}
