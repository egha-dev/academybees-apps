import { Module } from '@nestjs/common';

import { TeamModule } from '../team/index.js';
import { ActivityService } from './activity.service.js';
import { CustomFieldsService } from './custom-fields.service.js';
import { CustomFieldsController, ParentsController } from './parents.controller.js';
import { ParentsService } from './parents.service.js';
import { PeopleService } from './people.service.js';
import { StudentRecordsService } from './student-records.service.js';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';
import { SearchService } from './search.service.js';
import { SearchController, TeachersController } from './teachers.controller.js';
import { TeachersService } from './teachers.service.js';

/**
 * People (C-09, Phase 4): Students (list, Student 360, status, archive), parents and their links,
 * restricted health notes and consent, custom fields, teachers, the command-palette search and the
 * activity timeline. Onboarding uses
 * the same `PeopleService` commands. The students limit is counted in core/entitlements.
 */
@Module({
  imports: [TeamModule],
  controllers: [
    StudentsController,
    ParentsController,
    CustomFieldsController,
    TeachersController,
    SearchController,
  ],
  providers: [
    TeachersService,
    SearchService,
    PeopleService,
    StudentsService,
    ParentsService,
    StudentRecordsService,
    CustomFieldsService,
    ActivityService,
  ],
  exports: [PeopleService, StudentsService, ParentsService, ActivityService, CustomFieldsService],
})
export class PeopleModule {}
