import { Module } from '@nestjs/common';

import { PeopleService } from './people.service.js';

/**
 * People (C-09): Phase 3 has the commands onboarding needs; Phase 4 adds the Students, Parents
 * and Teachers workspaces and their endpoints. The students limit is counted in core/entitlements.
 */
@Module({ providers: [PeopleService], exports: [PeopleService] })
export class PeopleModule {}
