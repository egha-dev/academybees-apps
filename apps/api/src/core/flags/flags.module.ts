import { Global, Module } from '@nestjs/common';

import { FeatureFlagService } from './feature-flag.service.js';
import { FlagsController } from './flags.controller.js';

@Global()
@Module({
  controllers: [FlagsController],
  providers: [FeatureFlagService],
  exports: [FeatureFlagService],
})
export class FlagsModule {}
