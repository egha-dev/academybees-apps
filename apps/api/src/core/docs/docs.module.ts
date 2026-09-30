import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { DocsController } from './docs.controller.js';

@Module({ imports: [DiscoveryModule], controllers: [DocsController] })
export class DocsModule {}
