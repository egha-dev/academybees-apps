import { Module } from '@nestjs/common';

import { SessionGenerationProcessor } from './generation.processor.js';
import { SessionGenerationQueue } from './generation.queue.js';
import { SchedulingService } from './scheduling.service.js';

/**
 * Scheduling (C-09, ADR-024): Phase 3 has the commands onboarding needs; Phase 5 adds the
 * timetable workspace, the rolling session job (C-112) and their endpoints.
 */
@Module({
  providers: [SchedulingService, SessionGenerationQueue, SessionGenerationProcessor],
  exports: [SchedulingService, SessionGenerationQueue],
})
export class SchedulingModule {}
