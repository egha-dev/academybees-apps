import { Global, Module } from '@nestjs/common';

import { ActivityService } from './activity.service.js';

/** The user-facing timeline (ADR-027), shared by people and scheduling (C-122). */
@Global()
@Module({ providers: [ActivityService], exports: [ActivityService] })
export class ActivityModule {}
