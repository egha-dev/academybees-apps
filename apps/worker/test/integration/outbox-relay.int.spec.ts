import { newId, QUEUES } from '@academybee/contracts';
import { createAppClient, type PrismaClient, withTransaction } from '@academybee/database';
import { createPlatformClient } from '@academybee/database/platform';
import { buildOutboxEvent } from '@academybee/testing';
import { type Queue } from 'bullmq';
import { type Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { OutboxRelay } from '../../src/platform/outbox-relay.js';
import { createQueue, createRedisConnection } from '../../src/queues/queues.js';

/**
 * Phase 0 exit gate (ADR-019): an event written in a rolled-back transaction is never
 * dispatched; a committed event is dispatched exactly once — including with 2 relays racing.
 */
describe('outbox relay', () => {
  const urls = inject('databaseUrls');
  let app: PrismaClient;
  const platformClients: PrismaClient[] = [];
  const connections: Redis[] = [];
  const queues: Queue[] = [];
  let relays: OutboxRelay[];
  let inspect: Queue;

  const newRelay = (batchSize = 100) => {
    const db = createPlatformClient(urls.platform, { maxConnections: 2 });
    const conn = createRedisConnection(inject('redisUrl'));
    const queue = createQueue(QUEUES.domainEvents, conn);
    platformClients.push(db);
    connections.push(conn);
    queues.push(queue);
    return new OutboxRelay(db, queue, { batchSize });
  };

  const relayUntilIdle = async () => {
    for (;;) {
      const counts = await Promise.all(relays.map((r) => r.relayOnce()));
      if (counts.every((n) => n === 0)) return;
    }
  };

  beforeAll(() => {
    app = createAppClient(urls.app);
    relays = [newRelay(10), newRelay(10)];
    inspect = queues[0]!;
  });

  beforeEach(async () => {
    await inspect.obliterate({ force: true });
    await app.outboxEvent.deleteMany();
  });

  afterAll(async () => {
    await Promise.all(queues.map((q) => q.close()));
    await Promise.all(connections.map((c) => c.quit()));
    await Promise.all([app, ...platformClients].map((c) => c.$disconnect()));
  });

  it('never dispatches an event from a rolled-back transaction', async () => {
    const event = buildOutboxEvent({ type: 'test.rolled_back' });
    await expect(
      withTransaction(app, async (tx) => {
        await tx.outboxEvent.create({ data: { ...event, payload: event.payload } });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    await relayUntilIdle();
    expect(await inspect.getJob(event.id)).toBeUndefined();
    expect(await inspect.count()).toBe(0);
  });

  it('dispatches a committed event exactly once with two relays racing', async () => {
    const event = buildOutboxEvent({ type: 'test.committed', payload: { amountMinor: 50_000 } });
    await withTransaction(app, (tx) =>
      tx.outboxEvent.create({
        data: { ...event, requestId: 'req-1', payload: event.payload },
      }),
    );

    await Promise.all([relayUntilIdle(), relayUntilIdle()]);
    await relayUntilIdle();

    const jobs = await inspect.getJobs(['waiting', 'delayed', 'active', 'completed', 'failed']);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.id).toBe(event.id);
    expect(jobs[0]!.name).toBe('test.committed');
    expect(jobs[0]!.data).toMatchObject({
      tenantId: 'platform',
      requestId: 'req-1',
      actor: { type: 'SYSTEM' },
      data: { eventId: event.id, type: 'test.committed', payload: { amountMinor: 50_000 } },
    });
    const row = await app.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.dispatchedAt).not.toBeNull();
  });

  it('relays a backlog of 250 events once each across concurrent relays', async () => {
    const events = Array.from({ length: 250 }, (_, i) =>
      buildOutboxEvent({ type: 'test.bulk', payload: { i } }),
    );
    await app.outboxEvent.createMany({
      data: events.map((e) => ({ ...e, payload: e.payload })),
    });

    await Promise.all([relayUntilIdle(), relayUntilIdle(), relayUntilIdle()]);

    expect(await inspect.count()).toBe(250);
    const ids = new Set((await inspect.getJobs(['waiting'], 0, 1000)).map((j) => j.id));
    expect(ids.size).toBe(250);
    for (const e of events) expect(ids.has(e.id)).toBe(true);
    expect(await app.outboxEvent.count({ where: { dispatchedAt: null } })).toBe(0);
  });

  it('re-enqueueing the same event ID is ignored by the queue (crash between enqueue and commit)', async () => {
    const id = newId();
    await inspect.add('test.dup', { n: 1 }, { jobId: id });
    await inspect.add('test.dup', { n: 2 }, { jobId: id });
    expect(await inspect.count()).toBe(1);
  });

  it('holds events until their availableAt', async () => {
    const event = buildOutboxEvent({ type: 'test.later' });
    await app.outboxEvent.create({
      data: {
        ...event,
        payload: event.payload,
        availableAt: new Date(Date.now() + 60_000),
      },
    });
    await relayUntilIdle();
    expect(await inspect.getJob(event.id)).toBeUndefined();
  });
});
