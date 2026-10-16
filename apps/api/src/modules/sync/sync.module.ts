import { Module } from '@nestjs/common';

import { AttendanceModule } from '../attendance/index.js';
import { PeopleModule } from '../people/index.js';
import { SchedulingModule } from '../scheduling/index.js';
import { SyncController } from './sync.controller.js';
import { SyncService } from './sync.service.js';

/** Offline sync: push with the op ledger, pull and bootstrap of the working set (ADR-016). */
@Module({
  imports: [AttendanceModule, SchedulingModule, PeopleModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
