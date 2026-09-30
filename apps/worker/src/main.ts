import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { InvalidWorkerConfigError, loadWorkerConfig } from './config/config.js';
import { WorkerModule } from './worker.module.js';

async function bootstrap(): Promise<void> {
  let config;
  try {
    config = loadWorkerConfig();
  } catch (error) {
    if (error instanceof InvalidWorkerConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
  const app = await NestFactory.createApplicationContext(WorkerModule.forRoot(config), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  // SIGTERM/SIGINT → finish in-flight jobs and the current relay pass, then exit.
  app.enableShutdownHooks();
  await app.init();
  app.get(Logger).log('Worker started');
}

void bootstrap();
