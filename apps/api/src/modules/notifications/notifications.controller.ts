import {
  CursorPageQuerySchema,
  MarkNotificationsReadSchema,
  NotificationPageSchema,
  UnreadCountSchema,
} from '@academybee/contracts';
import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';

import { SignedIn } from '../../core/rbac/can.decorator.js';
import { createZodDto, ZodResponse } from '../../core/validation/zod-dto.js';
import { NotificationsService } from './notifications.service.js';

class PageQueryDto extends createZodDto(CursorPageQuerySchema) {}
class MarkReadDto extends createZodDto(MarkNotificationsReadSchema) {}

/** My notifications in this academy (any signed-in member; each sees only their own). */
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @SignedIn()
  @ZodResponse(NotificationPageSchema)
  list(@Query() query: PageQueryDto) {
    return this.notifications.list(query);
  }

  @Get('unread')
  @SignedIn()
  @ZodResponse(UnreadCountSchema)
  unread() {
    return this.notifications.unread();
  }

  @Post('read')
  @HttpCode(200)
  @SignedIn()
  @ZodResponse(UnreadCountSchema)
  read(@Body() body: MarkReadDto) {
    return this.notifications.markRead(body);
  }
}
