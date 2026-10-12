import {
  CancelSessionSchema,
  CreateSessionSchema,
  HolidayCreatedSchema,
  HolidayInputSchema,
  HolidayListQuerySchema,
  HolidayListSchema,
  HolidayPreviewSchema,
  HolidaySchema,
  RestoreSessionSchema,
  SaveScheduleSchema,
  ScheduleSchema,
  SessionListSchema,
  SessionResultSchema,
  SessionsQuerySchema,
  TodaySchema,
  UpdateSessionSchema,
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
} from '@nestjs/common';

import { Idempotent } from '../../core/idempotency/idempotent.js';
import { Can } from '../../core/rbac/can.decorator.js';
import { createZodDto, ZodResponse } from '../../core/validation/zod-dto.js';
import { HolidaysService } from './holidays.service.js';
import { ScheduleService } from './schedule.service.js';
import { SessionsService } from './sessions.service.js';
import { TodayService } from './today.service.js';

class SaveScheduleDto extends createZodDto(SaveScheduleSchema) {}
class SessionsQueryDto extends createZodDto(SessionsQuerySchema) {}
class CreateSessionDto extends createZodDto(CreateSessionSchema) {}
class UpdateSessionDto extends createZodDto(UpdateSessionSchema) {}
class CancelSessionDto extends createZodDto(CancelSessionSchema) {}
class RestoreSessionDto extends createZodDto(RestoreSessionSchema) {}
class HolidayInputDto extends createZodDto(HolidayInputSchema) {}
class HolidayListQueryDto extends createZodDto(HolidayListQuerySchema) {}

const Id = new ParseUUIDPipe({ version: '7' });

/** A batch's weekly pattern (C-113, C-121). */
@Controller({ path: 'batches', version: '1' })
export class BatchScheduleController {
  constructor(private readonly schedule: ScheduleService) {}

  @Get(':id/schedule')
  @Can('batch.read')
  @ZodResponse(ScheduleSchema)
  get(@Param('id', Id) id: string) {
    return this.schedule.get(id);
  }

  @Put(':id/schedule')
  @Can('timetable.manage')
  @ZodResponse(ScheduleSchema)
  save(@Param('id', Id) id: string, @Body() body: SaveScheduleDto) {
    return this.schedule.save(id, body);
  }
}

/** Class sessions (ADR-024): the timetable range, extra and make-up classes, move, cancel. */
@Controller({ path: 'sessions', version: '1' })
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  @Can('timetable.read')
  @ZodResponse(SessionListSchema)
  list(@Query() query: SessionsQueryDto) {
    return this.sessions.list(query);
  }

  @Post()
  @Can('session.manage')
  @Idempotent()
  @HttpCode(201)
  @ZodResponse(SessionResultSchema)
  create(@Body() body: CreateSessionDto) {
    return this.sessions.create(body);
  }

  @Patch(':id')
  @Can('session.manage')
  @ZodResponse(SessionResultSchema)
  update(@Param('id', Id) id: string, @Body() body: UpdateSessionDto) {
    return this.sessions.update(id, body);
  }

  @Post(':id/cancel')
  @Can('session.manage')
  @HttpCode(200)
  @ZodResponse(SessionResultSchema)
  cancel(@Param('id', Id) id: string, @Body() body: CancelSessionDto) {
    return this.sessions.cancel(id, body);
  }

  @Post(':id/restore')
  @Can('session.manage')
  @HttpCode(200)
  @ZodResponse(SessionResultSchema)
  restore(@Param('id', Id) id: string, @Body() body: RestoreSessionDto) {
    return this.sessions.restore(id, body);
  }
}

/** Holidays and closures (G-03, C-115). */
@Controller({ path: 'holidays', version: '1' })
export class HolidaysController {
  constructor(private readonly holidays: HolidaysService) {}

  @Get()
  @Can('timetable.read')
  @ZodResponse(HolidayListSchema)
  list(@Query() query: HolidayListQueryDto) {
    return this.holidays.list(query);
  }

  @Post('preview')
  @Can('timetable.manage')
  @HttpCode(200)
  @ZodResponse(HolidayPreviewSchema)
  preview(@Body() body: HolidayInputDto) {
    return this.holidays.preview(body);
  }

  @Post()
  @Can('timetable.manage')
  @Idempotent()
  @HttpCode(201)
  @ZodResponse(HolidayCreatedSchema)
  create(@Body() body: HolidayInputDto) {
    return this.holidays.create(body);
  }

  @Delete(':id')
  @Can('timetable.manage')
  @ZodResponse(HolidaySchema)
  remove(@Param('id', Id) id: string) {
    return this.holidays.remove(id);
  }
}

/** Owner Today v1 (UX §11.1): today's classes, attention items, recent changes. */
@Controller({ path: 'today', version: '1' })
export class TodayController {
  constructor(private readonly today: TodayService) {}

  @Get()
  @Can('timetable.read')
  @ZodResponse(TodaySchema)
  get() {
    return this.today.today();
  }
}
