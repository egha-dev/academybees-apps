import { Module } from '@nestjs/common';

import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

/** Academy settings (Phase 2: the 2FA rule; Phase 3 adds the rest). */
@Module({ controllers: [SettingsController], providers: [SettingsService] })
export class SettingsModule {}
