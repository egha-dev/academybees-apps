import {
  ActivityPageSchema,
  CreateTeacherSchema,
  CursorPageQuerySchema,
  LinkableMemberListSchema,
  SearchQuerySchema,
  SearchResultsSchema,
  TeacherListQuerySchema,
  TeacherPageSchema,
  TeacherSchema,
  UpdateTeacherSchema,
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
  Query,
} from '@nestjs/common';

import { Idempotent } from '../../core/idempotency/idempotent.js';
import { Can, SignedIn } from '../../core/rbac/can.decorator.js';
import { createZodDto, ZodResponse } from '../../core/validation/zod-dto.js';
import { ActivityService } from './activity.service.js';
import { SearchService } from './search.service.js';
import { TeachersService } from './teachers.service.js';

class ListQueryDto extends createZodDto(TeacherListQuerySchema) {}
class PageQueryDto extends createZodDto(CursorPageQuerySchema) {}
class CreateTeacherDto extends createZodDto(CreateTeacherSchema) {}
class UpdateTeacherDto extends createZodDto(UpdateTeacherSchema) {}
class SearchQueryDto extends createZodDto(SearchQuerySchema) {}

const Id = new ParseUUIDPipe({ version: '7' });

/** Teachers (UX §11, ARCHITECTURE §7.3): list, profile, add (name / invite / team member), edit. */
@Controller({ path: 'teachers', version: '1' })
export class TeachersController {
  constructor(
    private readonly teachers: TeachersService,
    private readonly activity: ActivityService,
  ) {}

  @Get()
  @Can('teacher.read')
  @ZodResponse(TeacherPageSchema)
  list(@Query() query: ListQueryDto) {
    return this.teachers.list(query);
  }

  @Post()
  @Can('teacher.manage')
  @Idempotent()
  @HttpCode(201)
  @ZodResponse(TeacherSchema)
  create(@Body() body: CreateTeacherDto) {
    return this.teachers.create(body);
  }

  /** Declared before `:id`. */
  @Get('linkable-members')
  @Can('teacher.manage')
  @ZodResponse(LinkableMemberListSchema)
  linkable() {
    return this.teachers.linkableMembers();
  }

  @Get(':id')
  @Can('teacher.read')
  @ZodResponse(TeacherSchema)
  get(@Param('id', Id) id: string) {
    return this.teachers.get(id);
  }

  @Patch(':id')
  @Can('teacher.manage')
  @ZodResponse(TeacherSchema)
  update(@Param('id', Id) id: string, @Body() body: UpdateTeacherDto) {
    return this.teachers.update(id, body);
  }

  @Get(':id/activity')
  @Can('teacher.read')
  @ZodResponse(ActivityPageSchema)
  async activityPage(@Param('id', Id) id: string, @Query() query: PageQueryDto) {
    await this.teachers.assertReadable(id);
    return this.activity.page('TEACHER', id, query);
  }
}

/**
 * `GET /search?q=` for the command palette (C-105). Any signed-in member may ask; each type is
 * filtered by the caller's own capabilities and scopes, so a role sees only what its lists show.
 */
@Controller({ path: 'search', version: '1' })
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @SignedIn()
  @ZodResponse(SearchResultsSchema)
  search(@Query() query: SearchQueryDto) {
    return this.searchService.search(query.q);
  }
}
