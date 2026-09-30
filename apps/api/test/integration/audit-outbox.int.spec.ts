import { newId } from '@academybee/contracts';
import { type PrismaClient, withTransaction } from '@academybee/database';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuditService } from '../../src/core/audit/audit.service.js';
import { APP_DB } from '../../src/core/database/database.module.js';
import { OutboxService } from '../../src/core/outbox/outbox.service.js';
import { createTestApp } from '../support/test-app.js';

describe('audit and outbox services', () => {
  let app: INestApplication;
  let db: PrismaClient;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(APP_DB);
  });
  afterAll(async () => {
    await app.close();
  });

  it('@Audited records the action with the request ID and entity ID', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/test/payments')
      .set('Idempotency-Key', newId())
      .set('x-request-id', 'audit-test-req-1')
      .send({ amountMinor: 10 });
    const entry = await db.auditLog.findFirst({ where: { requestId: 'audit-test-req-1' } });
    expect(entry).toMatchObject({
      action: 'test.payment_recorded',
      entityType: 'Payment',
      entityId: res.body.id,
      actorType: 'SYSTEM',
    });
  });

  it('outbox rows commit with the transaction and vanish when it rolls back', async () => {
    const outbox = app.get(OutboxService);
    const audit = app.get(AuditService);
    const committedId = await withTransaction(db, (tx) =>
      outbox.write(tx, { type: 'test.committed', payload: { a: 1 } }),
    );

    let rolledBackId = '';
    await expect(
      withTransaction(db, async (tx) => {
        rolledBackId = await outbox.write(tx, { type: 'test.rolled_back', payload: {} });
        await audit.record({ action: 'test.rolled_back' }, tx);
        throw new Error('business rule failed');
      }),
    ).rejects.toThrow('business rule failed');

    expect(await db.outboxEvent.findUnique({ where: { id: committedId } })).toMatchObject({
      type: 'test.committed',
      dispatchedAt: null,
    });
    expect(await db.outboxEvent.findUnique({ where: { id: rolledBackId } })).toBeNull();
    expect(await db.auditLog.count({ where: { action: 'test.rolled_back' } })).toBe(0);
  });
});
