import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';

import { buildOpenApi } from './openapi.js';

/** Registered only when APP_ENV is not production (see AppModule). */
@Controller({ path: 'docs', version: VERSION_NEUTRAL })
export class DocsController {
  private doc: ReturnType<typeof buildOpenApi> | undefined;

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
  ) {}

  @Get()
  openapi() {
    this.doc ??= buildOpenApi(this.discovery, this.scanner);
    return this.doc;
  }
}
