import {
  ActivityPageSchema,
  ArchiveStudentSchema,
  ChangeStudentStatusSchema,
  ConsentHistorySchema,
  CreateStudentSchema,
  CursorPageQuerySchema,
  HealthNoteSchema,
  LinkParentSchema,
  PutHealthNoteSchema,
  RecordConsentSchema,
  RestoreStudentSchema,
  StudentListQuerySchema,
  StudentPageSchema,
  StudentPhotoSchema,
  StudentSchema,
  UpdateParentLinkSchema,
  UpdateStudentSchema,
} from '@academybee/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Inject } from '@nestjs/common';
import type { TenantBoundClient } from '@academybee/database';

import { TENANT_DB } from '../../core/database/database.module.js';
import { Limit } from '../../core/entitlements/entitlement.decorators.js';
import { Idempotent } from '../../core/idempotency/idempotent.js';
import { Can } from '../../core/rbac/can.decorator.js';
import { createZodDto, ZodResponse } from '../../core/validation/zod-dto.js';
import { ActivityService } from './activity.service.js';
import { ParentsService } from './parents.service.js';
import { StudentPhotoService } from './student-photo.service.js';
import { StudentRecordsService } from './student-records.service.js';
import { StudentsService } from './students.service.js';

class ListQueryDto extends createZodDto(StudentListQuerySchema) {}
class PageQueryDto extends createZodDto(CursorPageQuerySchema) {}
class CreateStudentDto extends createZodDto(CreateStudentSchema) {}
class UpdateStudentDto extends createZodDto(UpdateStudentSchema) {}
class ChangeStatusDto extends createZodDto(ChangeStudentStatusSchema) {}
class ArchiveDto extends createZodDto(ArchiveStudentSchema) {}
class RestoreDto extends createZodDto(RestoreStudentSchema) {}
class LinkParentDto extends createZodDto(LinkParentSchema) {}
class UpdateLinkDto extends createZodDto(UpdateParentLinkSchema) {}
class PutHealthNoteDto extends createZodDto(PutHealthNoteSchema) {}
class RecordConsentDto extends createZodDto(RecordConsentSchema) {}

const Id = new ParseUUIDPipe({ version: '7' });

/**
 * Students (UX §11.3–11.4; G-05, G-06, G-26, G-27). Every route is in the cross-tenant suite;
 * scope is applied in the services (people.policy.ts) — out of scope answers 404.
 */
@Controller({ path: 'students', version: '1' })
export class StudentsController {
  constructor(
    private readonly students: StudentsService,
    private readonly parents: ParentsService,
    private readonly records: StudentRecordsService,
    private readonly activity: ActivityService,
    private readonly photos: StudentPhotoService,
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
  ) {}

  @Get()
  @Can('student.read')
  @ZodResponse(StudentPageSchema)
  list(@Query() query: ListQueryDto) {
    return this.students.list(query);
  }

  @Post()
  @Can('student.create')
  @Limit('students')
  @Idempotent()
  @HttpCode(201)
  @ZodResponse(StudentSchema)
  create(@Body() body: CreateStudentDto) {
    return this.students.create(body);
  }

  @Get(':id')
  @Can('student.read')
  @ZodResponse(StudentSchema)
  get(@Param('id', Id) id: string) {
    return this.students.get(id);
  }

  @Patch(':id')
  @Can('student.update')
  @ZodResponse(StudentSchema)
  update(@Param('id', Id) id: string, @Body() body: UpdateStudentDto) {
    return this.students.update(id, body);
  }

  @Post(':id/status')
  @Can('student.update')
  @HttpCode(200)
  @ZodResponse(StudentSchema)
  changeStatus(@Param('id', Id) id: string, @Body() body: ChangeStatusDto) {
    return this.students.changeStatus(id, body);
  }

  @Post(':id/archive')
  @Can('student.archive')
  @HttpCode(200)
  @ZodResponse(StudentSchema)
  archive(@Param('id', Id) id: string, @Body() body: ArchiveDto) {
    return this.students.archive(id, body);
  }

  @Post(':id/restore')
  @Can('student.archive')
  @HttpCode(200)
  @ZodResponse(StudentSchema)
  restore(@Param('id', Id) id: string, @Body() body: RestoreDto) {
    return this.students.restore(id, body);
  }

  @Get(':id/activity')
  @Can('student.read')
  @ZodResponse(ActivityPageSchema)
  async activityPage(@Param('id', Id) id: string, @Query() query: PageQueryDto) {
    await this.students.assertReadable(id);
    return this.activity.page('STUDENT', id, query);
  }

  // ── Parents of a student ──────────────────────────────────────────────────────────────────

  @Post(':id/parents')
  @Can('parent.manage')
  @Idempotent()
  @HttpCode(201)
  @ZodResponse(StudentSchema)
  async linkParent(@Param('id', Id) id: string, @Body() body: LinkParentDto) {
    await this.db.$transaction(async (tx) => {
      const student = await this.students.loadForWrite(tx, id, 'student.update');
      await this.parents.link(tx, { tenantId: student.tenantId, studentId: id, link: body });
    });
    return this.students.get(id);
  }

  @Patch(':id/parents/:linkId')
  @Can('parent.manage')
  @ZodResponse(StudentSchema)
  async updateParentLink(
    @Param('id', Id) id: string,
    @Param('linkId', Id) linkId: string,
    @Body() body: UpdateLinkDto,
  ) {
    await this.parents.updateLink(id, linkId, body);
    return this.students.get(id);
  }

  @Delete(':id/parents/:linkId')
  @Can('parent.manage')
  @ZodResponse(StudentSchema)
  async unlinkParent(@Param('id', Id) id: string, @Param('linkId', Id) linkId: string) {
    await this.parents.unlink(id, linkId);
    return this.students.get(id);
  }

  // ── Photo (private, consent-gated, C-97) ──────────────────────────────────────────────────

  /** Raw image bytes (PNG, JPEG, WebP; ≤ 2 MB). */
  @Put(':id/photo')
  @Can('student.update')
  @ZodResponse(StudentSchema)
  async uploadPhoto(@Param('id', Id) id: string, @Req() req: Request) {
    await this.photos.upload(id, req.body);
    return this.students.get(id);
  }

  @Delete(':id/photo')
  @Can('student.update')
  @ZodResponse(StudentSchema)
  async removePhoto(@Param('id', Id) id: string) {
    await this.photos.remove(id);
    return this.students.get(id);
  }

  /** A link to the photo valid for 5 minutes; each one is an audited view. */
  @Get(':id/photo')
  @Can('student.read')
  @ZodResponse(StudentPhotoSchema)
  photo(@Param('id', Id) id: string) {
    return this.photos.link(id);
  }

  // ── Restricted records ────────────────────────────────────────────────────────────────────

  @Get(':id/health-note')
  @Can('student.health.read')
  @ZodResponse(HealthNoteSchema)
  healthNote(@Param('id', Id) id: string) {
    return this.records.readHealthNote(id);
  }

  @Put(':id/health-note')
  @Can('student.health.manage')
  @ZodResponse(HealthNoteSchema)
  writeHealthNote(@Param('id', Id) id: string, @Body() body: PutHealthNoteDto) {
    return this.records.writeHealthNote(id, body);
  }

  @Get(':id/consents')
  @Can('parent.read')
  @ZodResponse(ConsentHistorySchema)
  consents(@Param('id', Id) id: string) {
    return this.records.consents(id);
  }

  @Post(':id/consents')
  @Can('parent.manage')
  @Idempotent()
  @HttpCode(201)
  @ZodResponse(ConsentHistorySchema)
  recordConsent(@Param('id', Id) id: string, @Body() body: RecordConsentDto) {
    return this.records.recordConsent(id, body);
  }
}
