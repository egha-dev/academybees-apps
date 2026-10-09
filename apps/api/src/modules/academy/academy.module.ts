import { Module } from '@nestjs/common';

import { AcademyController } from './academy.controller.js';
import { AcademyService } from './academy.service.js';

/** Settings → Academy and Branding & Domain (UX v1.1 §6). */
@Module({ controllers: [AcademyController], providers: [AcademyService] })
export class AcademyModule {}
