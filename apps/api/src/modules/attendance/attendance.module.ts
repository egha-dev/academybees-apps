import { Module } from '@nestjs/common';

import { PeopleModule } from '../people/index.js';
import { SchedulingModule } from '../scheduling/index.js';
import {
  AttendanceController,
  BatchAttendanceController,
  SessionAttendanceController,
  StudentAttendanceController,
} from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';

/**
 * Attendance (Phase 6; ADR-017, C-126…C-131): roll calls, history and percentages. Reads classes
 * and rosters through the scheduling and people modules' services (C-122).
 */
@Module({
  imports: [SchedulingModule, PeopleModule],
  controllers: [
    SessionAttendanceController,
    AttendanceController,
    StudentAttendanceController,
    BatchAttendanceController,
  ],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
