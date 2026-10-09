import { Global, Module } from '@nestjs/common';

import { MediaStorage } from './media-storage.js';

/** Object storage (C-97), available to every module that stores files. */
@Global()
@Module({ providers: [MediaStorage], exports: [MediaStorage] })
export class MediaModule {}
