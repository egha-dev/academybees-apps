import { newId } from '@academybee/contracts';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp } from '../support/test-app.js';
import { executions } from '../support/test-support.module.js';

/** Phase 0 exit gate: Idempotency-Key semantics (ARCHITECTURE §9.1). */
describe('@Idempotent()', () => {
  let app: INestApplication;
  const post = (key: string | undefined, body: object, path = '/api/v1/test/payments') => {
    const req = request(app.getHttpServer()).post(path).send(body);
    return key ? req.set('Idempotency-Key', key) : req;
  };

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    executions.count = 0;
  });

  it('requires a valid Idempotency-Key', async () => {
    const res = await post(undefined, { amountMinor: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ path: 'Idempotency-Key', issue: 'required' }]);
    expect(executions.count).toBe(0);
  });

  it('same key + same body → replays the stored response without re-executing', async () => {
    const key = newId();
    const first = await post(key, { amountMinor: 50_000 });
    const second = await post(key, { amountMinor: 50_000 });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(executions.count).toBe(1);
  });

  it('same key + different body → 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const key = newId();
    await post(key, { amountMinor: 50_000 });
    const res = await post(key, { amountMinor: 99_999 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(executions.count).toBe(1);
  });

  it('concurrent duplicates → exactly one execution', async () => {
    const key = newId();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => post(key, { amountMinor: 700 })),
    );
    expect(executions.count).toBe(1);
    const created = results.filter((r) => r.status === 201);
    const inProgress = results.filter((r) => r.status === 409);
    expect(created.length + inProgress.length).toBe(5);
    expect(created.length).toBeGreaterThanOrEqual(1);
    for (const r of inProgress) expect(r.body.error.code).toBe('IDEMPOTENCY_KEY_IN_PROGRESS');
    const ids = new Set(created.map((r) => r.body.id as string));
    expect(ids.size).toBe(1);
  });

  it('a failed request releases the key so the client can retry', async () => {
    const key = newId();
    const a = await post(key, { amountMinor: 1 }, '/api/v1/test/failing-payments');
    const b = await post(key, { amountMinor: 1 }, '/api/v1/test/failing-payments');
    expect(a.status).toBe(409);
    expect(b.status).toBe(409);
    expect(b.body.error.code).toBe('INVALID_STATE_TRANSITION');
    expect(executions.count).toBe(2);
  });

  it('the same key is independent per route', async () => {
    const key = newId();
    await post(key, { amountMinor: 5 });
    const other = await post(key, { amountMinor: 5 }, '/api/v1/test/failing-payments');
    expect(other.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });
});
