import {
  ActivityPageSchema,
  BatchListQuerySchema,
  BatchPageSchema,
  BatchSchema,
  CourseListQuerySchema,
  CourseListSchema,
  CourseSchema,
  CreateBatchSchema,
  CreateCourseSchema,
  CreateLevelSchema,
  CursorPageQuerySchema,
  SetBatchTeachersSchema,
  UpdateBatchSchema,
  UpdateCourseSchema,
  UpdateLevelSchema,
} from '@academybee/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import { ActivityService } from '../../core/activity/activity.service.js';
import { Idempotent } from '../../core/idempotency/idempotent.js';
import { Can } from '../../core/rbac/can.decorator.js';
import { createZodDto, ZodResponse } from '../../core/validation/zod-dto.js';
import { BatchesService } from './batches.service.js';
import { CoursesService } from './courses.service.js';

class CourseListQueryDto extends createZodDto(CourseListQuerySchema) {}
class CreateCourseDto extends createZodDto(CreateCourseSchema) {}
class UpdateCourseDto extends createZodDto(UpdateCourseSchema) {}
class CreateLevelDto extends createZodDto(CreateLevelSchema) {}
class UpdateLevelDto extends createZodDto(UpdateLevelSchema) {}
class BatchListQueryDto extends createZodDto(BatchListQuerySchema) {}
class CreateBatchDto extends createZodDto(CreateBatchSchema) {}
class UpdateBatchDto extends createZodDto(UpdateBatchSchema) {}
class SetTeachersDto extends createZodDto(SetBatchTeachersSchema) {}
class PageQueryDto extends createZodDto(CursorPageQuerySchema) {}

const Id = new ParseUUIDPipe({ version: '7' });

/** Courses and levels (PRD v3 §9). */
@Controller({ path: 'courses', version: '1' })
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  @Can('course.read')
  @ZodResponse(CourseListSchema)
  list(@Query() query: CourseListQueryDto) {
    return this.courses.list(query.status);
  }

  @Post()
  @Can('course.manage')
  @Idempotent()
  @HttpCode(201)
  @ZodResponse(CourseSchema)
  create(@Body() body: CreateCourseDto) {
    return this.courses.create(body);
  }

  @Get(':id')
  @Can('course.read')
  @ZodResponse(CourseSchema)
  get(@Param('id', Id) id: string) {
    return this.courses.get(id);
  }

  @Patch(':id')
  @Can('course.manage')
  @ZodResponse(CourseSchema)
  update(@Param('id', Id) id: string, @Body() body: UpdateCourseDto) {
    return this.courses.update(id, body);
  }

  @Post(':id/levels')
  @Can('course.manage')
  @HttpCode(201)
  @ZodResponse(CourseSchema)
  addLevel(@Param('id', Id) id: string, @Body() body: CreateLevelDto) {
    return this.courses.addLevel(id, body.name);
  }

  @Patch(':id/levels/:levelId')
  @Can('course.manage')
  @ZodResponse(CourseSchema)
  updateLevel(
    @Param('id', Id) id: string,
    @Param('levelId', Id) levelId: string,
    @Body() body: UpdateLevelDto,
  ) {
    return this.courses.updateLevel(id, levelId, body);
  }
}

/** Batches (UX §11.5): list with per-day load, workspace header, create/edit, teachers. */
@Controller({ path: 'batches', version: '1' })
export class BatchesController {
  constructor(
    private readonly batches: BatchesService,
    private readonly activity: ActivityService,
  ) {}

  @Get()
  @Can('batch.read')
  @ZodResponse(BatchPageSchema)
  list(@Query() query: BatchListQueryDto) {
    return this.batches.list(query);
  }

  @Post()
  @Can('batch.manage')
  @Idempotent()
  @HttpCode(201)
  @ZodResponse(BatchSchema)
  create(@Body() body: CreateBatchDto) {
    return this.batches.create(body);
  }

  @Get(':id')
  @Can('batch.read')
  @ZodResponse(BatchSchema)
  get(@Param('id', Id) id: string) {
    return this.batches.get(id);
  }

  @Patch(':id')
  @Can('batch.manage')
  @ZodResponse(BatchSchema)
  update(@Param('id', Id) id: string, @Body() body: UpdateBatchDto) {
    return this.batches.update(id, body);
  }

  @Put(':id/teachers')
  @Can('batch.manage')
  @ZodResponse(BatchSchema)
  setTeachers(@Param('id', Id) id: string, @Body() body: SetTeachersDto) {
    return this.batches.setTeachers(id, body.teachers, body.version);
  }

  @Get(':id/activity')
  @Can('batch.read')
  @ZodResponse(ActivityPageSchema)
  async activityPage(@Param('id', Id) id: string, @Query() query: PageQueryDto) {
    await this.batches.find(this.batchesDb(), id, 'batch.read');
    return this.activity.page('BATCH', id, query);
  }

  private batchesDb() {
    return this.batches.db;
  }
}
