import { Module } from '@nestjs/common';

import { MediaModule } from '../../core/media/media.module.js';
import { SchedulingModule } from '../scheduling/index.js';
import { TeamModule } from '../team/index.js';
import {
  HubLinkController,
  JoinRequestsController,
  ParentInvitesController,
  PrivacyNoticeController,
} from './family/family.controller.js';
import { HubLinkService } from './family/hub-link.service.js';
import { JoinRequestsService } from './family/join-requests.service.js';
import { ParentAccessService } from './family/parent-access.service.js';
import { ImportController } from './import/import.controller.js';
import { ImportProcessor } from './import/import.processor.js';
import { ImportQueue } from './import/import.queue.js';
import { ImportService } from './import/import.service.js';
import { ActivityService } from './activity.service.js';
import { CustomFieldsService } from './custom-fields.service.js';
import { CustomFieldsController, ParentsController } from './parents.controller.js';
import { ParentsService } from './parents.service.js';
import { PeopleService } from './people.service.js';
import { StudentPhotoService } from './student-photo.service.js';
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
  imports: [TeamModule, SchedulingModule, MediaModule],
  controllers: [
    // Before StudentsController: `/students/import/...` must not be read as `/students/:id`.
    ImportController,
    StudentsController,
    ParentsController,
    CustomFieldsController,
    TeachersController,
    SearchController,
    ParentInvitesController,
    JoinRequestsController,
    HubLinkController,
    PrivacyNoticeController,
  ],
  providers: [
    StudentPhotoService,
    ParentAccessService,
    HubLinkService,
    JoinRequestsService,
    ImportQueue,
    ImportService,
    ImportProcessor,
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
