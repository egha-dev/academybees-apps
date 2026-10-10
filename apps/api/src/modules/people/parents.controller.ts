import {
  ActivityPageSchema,
  CreateCustomFieldSchema,
  CursorPageQuerySchema,
  CustomFieldListSchema,
  CustomFieldSchema,
  ParentDuplicateListSchema,
  ParentDuplicatesQuerySchema,
  ParentSchema,
  UpdateCustomFieldSchema,
  UpdateParentSchema,
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
import { Can } from '../../core/rbac/can.decorator.js';
import { TenantHost } from '../../core/tenant/host-policy.js';
import { createZodDto, ZodResponse } from '../../core/validation/zod-dto.js';
import { ActivityService } from './activity.service.js';
import { CustomFieldsService } from './custom-fields.service.js';
import { ParentsService } from './parents.service.js';

class UpdateParentDto extends createZodDto(UpdateParentSchema) {}
class DuplicatesQueryDto extends createZodDto(ParentDuplicatesQuerySchema) {}
class PageQueryDto extends createZodDto(CursorPageQuerySchema) {}
class CreateFieldDto extends createZodDto(CreateCustomFieldSchema) {}
class UpdateFieldDto extends createZodDto(UpdateCustomFieldSchema) {}

const Id = new ParseUUIDPipe({ version: '7' });

/** Parents, reached from Student 360 and search (C-106). */
@Controller({ path: 'parents', version: '1' })
export class ParentsController {
  constructor(
    private readonly parents: ParentsService,
    private readonly activity: ActivityService,
  ) {}

  /** "Use existing" suggestions while adding a parent (C-106). Declared before `:id`. */
  @Get('duplicates')
  @Can('parent.read')
  @ZodResponse(ParentDuplicateListSchema)
  duplicates(@Query() query: DuplicatesQueryDto) {
    return this.parents.duplicates(query);
  }

  @Get(':id')
  @Can('parent.read')
  @ZodResponse(ParentSchema)
  get(@Param('id', Id) id: string) {
    return this.parents.get(id);
  }

  @Patch(':id')
  @Can('parent.manage')
  @ZodResponse(ParentSchema)
  update(@Param('id', Id) id: string, @Body() body: UpdateParentDto) {
    return this.parents.update(id, body);
  }

  @Get(':id/activity')
  @Can('parent.read')
  @ZodResponse(ActivityPageSchema)
  async activityPage(@Param('id', Id) id: string, @Query() query: PageQueryDto) {
    await this.parents.get(id);
    return this.activity.page('PARENT', id, query);
  }
}

/**
 * Academy-defined student fields (G-05): read by anyone who sees students, changed by the owner.
 * Open during setup too (the import step maps columns to them).
 */
@Controller({ path: 'custom-fields', version: '1' })
@TenantHost('SETUP', 'ACTIVE')
export class CustomFieldsController {
  constructor(private readonly fields: CustomFieldsService) {}

  @Get()
  @Can('student.read')
  @ZodResponse(CustomFieldListSchema)
  async list() {
    return { items: await this.fields.list() };
  }

  @Post()
  @Can('academy.settings.manage')
  @Idempotent()
  @HttpCode(201)
  @ZodResponse(CustomFieldSchema)
  create(@Body() body: CreateFieldDto) {
    return this.fields.create(body);
  }

  @Patch(':id')
  @Can('academy.settings.manage')
  @ZodResponse(CustomFieldSchema)
  update(@Param('id', Id) id: string, @Body() body: UpdateFieldDto) {
    return this.fields.update(id, body);
  }
}
