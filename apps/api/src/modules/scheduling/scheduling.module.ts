import { Module } from '@nestjs/common';

import { BatchesService } from './batches.service.js';
import { CoursesService } from './courses.service.js';
import { SessionGenerationProcessor } from './generation.processor.js';
import { SessionGenerationQueue } from './generation.queue.js';
import { BatchesController, CoursesController } from './scheduling.controller.js';
import { SchedulingService } from './scheduling.service.js';

/**
 * Scheduling (C-09, ADR-024): courses, batches and their teachers, weekly patterns and class
 * sessions, the rolling session job (C-112). Enrolments live with students in the people module,
 * which calls this one (C-122).
 */
@Module({
  controllers: [CoursesController, BatchesController],
  providers: [
    SchedulingService,
    CoursesService,
    BatchesService,
    SessionGenerationQueue,
    SessionGenerationProcessor,
  ],
  exports: [SchedulingService, BatchesService, SessionGenerationQueue],
})
export class SchedulingModule {}
