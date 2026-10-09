import { type INestApplication, VersioningType } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { ClsMiddleware, ClsService } from 'nestjs-cls';
import { Logger } from 'nestjs-pino';

import { type ApiConfig } from './core/config/config.schema.js';
import { clsMiddlewareOptions } from './core/context/context.module.js';
import { ErrorEnvelopeFilter } from './core/errors/error.filter.js';

/** Settings shared by main.ts and the test harness, so tests exercise the real pipeline. */
export function configureApp(app: INestApplication, config: ApiConfig): void {
  const express = app as NestExpressApplication;
  express.useLogger(app.get(Logger));
  express.disable('x-powered-by');
  // req.ip = real client IP only behind configured proxies.
  express.set(
    'trust proxy',
    config.TRUSTED_PROXY_IPS.length > 0 ? config.TRUSTED_PROXY_IPS : false,
  );
  // Request context first, then body parsing (so parse errors still carry a request ID).
  const cls = new ClsMiddleware(clsMiddlewareOptions(config));
  express.use(cls.use.bind(cls));
  express.useBodyParser('json', { limit: '1mb' });
  // Branding images arrive as raw bytes (C-97); the service checks each purpose's own limit.
  express.useBodyParser('raw', {
    type: ['image/png', 'image/jpeg', 'image/webp', 'application/octet-stream'],
    limit: '3mb',
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI });
  // Registered here (not APP_FILTER) so it also handles unknown routes and body-parser errors.
  app.useGlobalFilters(new ErrorEnvelopeFilter(app.get(ClsService)));
  app.enableShutdownHooks();
}
