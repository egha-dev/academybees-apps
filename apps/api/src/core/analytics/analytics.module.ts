import { Global, Module } from '@nestjs/common';

import { AnalyticsService } from './analytics.service.js';
import { ServiceStartedEmitter } from './service-started.js';

@Global()
@Module({ providers: [AnalyticsService, ServiceStartedEmitter], exports: [AnalyticsService] })
export class AnalyticsModule {}
