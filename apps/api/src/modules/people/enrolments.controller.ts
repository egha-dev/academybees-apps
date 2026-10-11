import {
  ChangeEnrolmentDaysSchema,
  EndEnrolmentSchema,
  EnrolmentSchema,
  EnrolStudentSchema,
  RosterQuerySchema,
  RosterSchema,
  TransferStudentSchema,
} from '@academybee/contracts';
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';

import { Idempotent } from '../../core/idempotency/idempotent.js';
import { Can } from '../../core/rbac/can.decorator.js';
import { createZodDto, ZodResponse } from '../../core/validation/zod-dto.js';
import { EnrolmentsService } from './enrolments.service.js';

class RosterQueryDto extends createZodDto(RosterQuerySchema) {}
class EnrolDto extends createZodDto(EnrolStudentSchema) {}
class ChangeDaysDto extends createZodDto(ChangeEnrolmentDaysSchema) {}
class EndDto extends createZodDto(EndEnrolmentSchema) {}
class TransferDto extends createZodDto(TransferStudentSchema) {}

const Id = new ParseUUIDPipe({ version: '7' });

/** A batch's students over time (PRD v3 §9; C-120, C-122). */
@Controller({ path: 'batches', version: '1' })
export class BatchStudentsController {
  constructor(private readonly enrolments: EnrolmentsService) {}

  @Get(':id/students')
  @Can('batch.read')
  @ZodResponse(RosterSchema)
  roster(@Param('id', Id) id: string, @Query() query: RosterQueryDto) {
    return this.enrolments.roster(id, query.on);
  }

  @Post(':id/enrolments')
  @Can('batch.enrol')
  @Idempotent()
  @HttpCode(201)
  @ZodResponse(EnrolmentSchema)
  enrol(@Param('id', Id) id: string, @Body() body: EnrolDto) {
    return this.enrolments.enrol(id, body);
  }
}

/** Change a student's days, or end their time in a batch (C-120). */
@Controller({ path: 'enrolments', version: '1' })
export class EnrolmentsController {
  constructor(private readonly enrolments: EnrolmentsService) {}

  @Post(':id/days')
  @Can('batch.enrol')
  @Idempotent()
  @HttpCode(200)
  @ZodResponse(EnrolmentSchema)
  changeDays(@Param('id', Id) id: string, @Body() body: ChangeDaysDto) {
    return this.enrolments.changeDays(id, body);
  }

  @Post(':id/end')
  @Can('batch.enrol')
  @HttpCode(200)
  @ZodResponse(EnrolmentSchema)
  end(@Param('id', Id) id: string, @Body() body: EndDto) {
    return this.enrolments.end(id, body);
  }
}

/** Move a student to another batch on a date (G-27). */
@Controller({ path: 'students', version: '1' })
export class StudentTransferController {
  constructor(private readonly enrolments: EnrolmentsService) {}

  @Post(':id/transfer')
  @Can('batch.enrol')
  @Idempotent()
  @HttpCode(200)
  @ZodResponse(EnrolmentSchema)
  transfer(@Param('id', Id) id: string, @Body() body: TransferDto) {
    return this.enrolments.transfer(id, body);
  }
}
