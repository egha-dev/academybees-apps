import 'reflect-metadata';

import { type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createAppClient, type PrismaClient } from '@academybee/database';
import { buildOutboxEvent } from '@academybee/testing';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { loadWorkerConfig } from '../../src/config/config.js';
import { DomainEventsWorker } from '../../src/events/domain-events.worker.js';
import { HEARTBEAT_KEY } from '../../src/system/heartbeat.js';
import { WorkerModule } from '../../src/worker.module.js';

async function waitFor<T>(fn: () => Promise<T | undefined | null>, timeoutMs = 15_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('worker process', () => {
  const urls = inject('databaseUrls');
  let ctx: INestApplicationContext;
  let redis: Redis;
  let db: PrismaClient;
  const handled: string[] = [];

  beforeAll(async () => {
    const config = loadWorkerConfig({
      APP_ENV: 'ci',
      LOG_LEVEL: 'silent',
      DATABASE_URL: urls.app,
      PLATFORM_DATABASE_URL: urls.platform,
      REDIS_URL: inject('redisUrl'),
      OUTBOX_POLL_INTERVAL_MS: '100',
      HEARTBEAT_EVERY_MS: '1000',
      ANALYTICS_HASH_SALT: 'test-salt',
    });
    ctx = await NestFactory.createApplicationContext(WorkerModule.forRoot(config), {
      logger: false,
    });
    ctx.get(DomainEventsWorker).on('test.consumed', (event) => {
      handled.push(event.eventId);
      return Promise.resolve();
    });
    await ctx.init();
    redis = new Redis(inject('redisUrl'));
    db = createAppClient(urls.app);
  });

  afterAll(async () => {
    await ctx.close();
    await redis.quit();
    await db.$disconnect();
  });

  it('beats its heartbeat into Redis', async () => {
    const beat = await waitFor(() => redis.get(HEARTBEAT_KEY));
    expect(Date.now() - new Date(beat).getTime()).toBeLessThan(10_000);
  });

  it('relays a committed outbox event and runs its handler once', async () => {
    const event = buildOutboxEvent({ type: 'test.consumed' });
    await db.outboxEvent.create({ data: { ...event, payload: event.payload } });
    await waitFor(() => Promise.resolve(handled.includes(event.id)));
    await new Promise((r) => setTimeout(r, 500));
    expect(handled.filter((id) => id === event.id)).toHaveLength(1);
  });

  it('shuts down gracefully', async () => {
    await expect(ctx.close()).resolves.toBeUndefined();
  });
});
