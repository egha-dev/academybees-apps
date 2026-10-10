import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';
import { InvalidConfigError, loadApiConfig } from './core/config/config.schema.js';
import { initErrorReporting } from './core/observability/error-reporting.js';

async function bootstrap(): Promise<void> {
  let config;
  try {
    config = loadApiConfig();
  } catch (error) {
    if (error instanceof InvalidConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  await initErrorReporting({
    dsn: config.SENTRY_DSN,
    environment: config.APP_ENV,
    service: 'api',
    release: process.env.RELEASE_SHA,
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), {
    bufferLogs: true,
    bodyParser: false,
  });
  configureApp(app, config);
  // The API sits behind proxies that keep connections alive (the web's /api rewrite, Railway's
  // edge). Node closes idle sockets after 5 s by default, so a proxy could reuse a socket just as
  // it closed and get "socket hang up" (seen in E2E). Keep idle sockets longer than any client
  // does; headersTimeout must exceed keepAliveTimeout.
  const server = app.getHttpServer();
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  await app.listen(config.PORT);
}

void bootstrap();
