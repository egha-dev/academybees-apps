import { Module } from '@nestjs/common';

import { SchedulingModule } from '../scheduling/index.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { AttendanceNudgeProcessor } from './nudge.processor.js';
import { AttendanceNudgeQueue } from './nudge.queue.js';

/** In-app notifications and the attendance nudge job (Phase 6; C-04, G-16). */
@Module({
  imports: [SchedulingModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, AttendanceNudgeQueue, AttendanceNudgeProcessor],
  exports: [NotificationsService, AttendanceNudgeQueue],
})
export class NotificationsModule {}
