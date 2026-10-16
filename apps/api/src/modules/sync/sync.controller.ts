import {
  SyncBeaconSchema,
  SyncPullQuerySchema,
  SyncPushRequestSchema,
  SyncPushResponseSchema,
  SyncSnapshotSchema,
} from '@academybee/contracts';
import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';

import { Can } from '../../core/rbac/can.decorator.js';
import { createZodDto, ZodResponse } from '../../core/validation/zod-dto.js';
import { SyncService } from './sync.service.js';

class SyncPushDto extends createZodDto(SyncPushRequestSchema) {}
class SyncPullQueryDto extends createZodDto(SyncPullQuerySchema) {}
class SyncBeaconDto extends createZodDto(SyncBeaconSchema) {}

/**
 * Offline sync (ADR-016, ARCHITECTURE §11.3). Each op checks its own capability and scope; the
 * routes only require that the caller works with attendance at all.
 */
@Controller({ path: 'sync', version: '1' })
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('push')
  @HttpCode(200)
  @Can('attendance.mark')
  @ZodResponse(SyncPushResponseSchema)
  push(@Body() body: SyncPushDto) {
    return this.sync.push(body.ops);
  }

  @Get('bootstrap')
  @Can('attendance.read')
  @ZodResponse(SyncSnapshotSchema)
  bootstrap() {
    return this.sync.snapshot();
  }

  @Get('pull')
  @Can('attendance.read')
  @ZodResponse(SyncSnapshotSchema)
  pull(@Query() query: SyncPullQueryDto) {
    return this.sync.snapshot(new Date(query.since));
  }

  @Post('beacon')
  @HttpCode(204)
  @Can('attendance.read')
  beacon(@Body() body: SyncBeaconDto) {
    this.sync.beacon(body);
  }
}
