import { newId } from '@academybee/contracts';
import { type PrismaClient, withTransaction } from '@academybee/database';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { AuditService } from '../../src/core/audit/audit.service.js';
import { TENANT_DB } from '../../src/core/database/database.module.js';
import { OutboxService } from '../../src/core/outbox/outbox.service.js';
import { createTestApp } from '../support/test-app.js';

describe('audit and outbox services', () => {
  let app: INestApplication;
  let db: PrismaClient;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(TENANT_DB);
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
    // A request on a non-academy host writes a platform row, which the app role cannot read back
    // (review L8) — inspect it as the superuser.
    const su = new pg.Client({ connectionString: inject('databaseUrls').superuser });
    await su.connect();
    const { rows } = await su
      .query(
        `SELECT action, entity_type AS "entityType", entity_id AS "entityId", actor_type AS "actorType"
           FROM audit_log WHERE request_id = 'audit-test-req-1'`,
      )
      .finally(() => su.end());
    const entry = rows[0] as Record<string, unknown> | undefined;
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
    const check = new pg.Client({ connectionString: inject('databaseUrls').superuser });
    await check.connect();
    const { rows: rolledBack } = await check
      .query(`SELECT 1 FROM audit_log WHERE action = 'test.rolled_back'`)
      .finally(() => check.end());
    expect(rolledBack).toEqual([]);
  });
});
