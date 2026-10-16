import {
  AttendanceOverviewQuerySchema,
  AttendanceOverviewSchema,
  BatchAttendanceQuerySchema,
  BatchAttendanceSchema,
  MarkSessionInputSchema,
  SessionAttendanceSchema,
  StudentAttendanceQuerySchema,
  StudentAttendanceSchema,
  UpdateAttendanceInputSchema,
} from '@academybee/contracts';
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Put, Query } from '@nestjs/common';

import { DomainError } from '../../core/errors/domain-error.js';
import { Idempotent } from '../../core/idempotency/idempotent.js';
import { Can } from '../../core/rbac/can.decorator.js';
import { createZodDto, ZodResponse } from '../../core/validation/zod-dto.js';
import { AttendanceService, type MarkResult } from './attendance.service.js';

class MarkSessionDto extends createZodDto(MarkSessionInputSchema) {}
class UpdateAttendanceDto extends createZodDto(UpdateAttendanceInputSchema) {}
class StudentAttendanceQueryDto extends createZodDto(StudentAttendanceQuerySchema) {}
class BatchAttendanceQueryDto extends createZodDto(BatchAttendanceQuerySchema) {}
class AttendanceOverviewQueryDto extends createZodDto(AttendanceOverviewQuerySchema) {}

const Id = new ParseUUIDPipe({ version: '7' });

/** A conflict over the REST API: 409 naming the students someone else changed (ADR-017). */
function orConflict(result: MarkResult) {
  if (result.status === 'CONFLICT')
    throw new DomainError(
      'CONFLICT',
      'attendance changed by someone else',
      result.conflicts.map((c) => ({ path: `marks.${c.studentId}`, issue: 'changed_by_other' })),
    );
}

/** One class's roll call (UX §12). The web app saves through the sync queue (C-131). */
@Controller({ path: 'sessions', version: '1' })
export class SessionAttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get(':id/attendance')
  @Can('attendance.read')
  @ZodResponse(SessionAttendanceSchema)
  get(@Param('id', Id) id: string) {
    return this.attendance.forSession(id);
  }

  @Put(':id/attendance')
  @Can('attendance.mark')
  @Idempotent()
  @ZodResponse(SessionAttendanceSchema)
  async mark(@Param('id', Id) id: string, @Body() body: MarkSessionDto) {
    orConflict(await this.attendance.markSession(id, body, { source: 'online' }));
    return this.attendance.forSession(id);
  }
}

@Controller({ path: 'attendance', version: '1' })
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  /** Classes on one academy day and whether their roll call is taken (Owner Today, G-16). */
  @Get('overview')
  @Can('attendance.read')
  @ZodResponse(AttendanceOverviewSchema)
  overview(@Query() query: AttendanceOverviewQueryDto) {
    return this.attendance.overview(query.date);
  }

  /** Correct one mark from the version the user saw. */
  @Patch(':id')
  @Can('attendance.mark')
  @ZodResponse(SessionAttendanceSchema)
  async update(@Param('id', Id) id: string, @Body() body: UpdateAttendanceDto) {
    const result = await this.attendance.update(id, body);
    orConflict(result);
    return this.attendance.forSession(result.sessionId);
  }
}

@Controller({ path: 'students', version: '1' })
export class StudentAttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get(':id/attendance')
  @Can('attendance.read')
  @ZodResponse(StudentAttendanceSchema)
  get(@Param('id', Id) id: string, @Query() query: StudentAttendanceQueryDto) {
    return this.attendance.forStudent(id, query.months);
  }
}

@Controller({ path: 'batches', version: '1' })
export class BatchAttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get(':id/attendance')
  @Can('attendance.read')
  @ZodResponse(BatchAttendanceSchema)
  get(@Param('id', Id) id: string, @Query() query: BatchAttendanceQueryDto) {
    return this.attendance.forBatch(id, query.from, query.to);
  }
}
