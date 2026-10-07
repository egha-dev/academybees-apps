import { newId } from '@academybee/contracts';
import { type INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';

import { IdempotencyStore } from '../../src/core/idempotency/idempotency.store.js';
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

  it('a failure to store the response after the handler succeeded keeps the key locked', async () => {
    const store = app.get(IdempotencyStore);
    const complete = vi
      .spyOn(store, 'complete')
      .mockRejectedValueOnce(new Error('connection reset'));
    try {
      const key = newId();
      const first = await post(key, { amountMinor: 2_500 });
      const retry = await post(key, { amountMinor: 2_500 });
      expect(first.status).toBe(500);
      expect(retry.status).toBe(409);
      expect(retry.body.error.code).toBe('IDEMPOTENCY_KEY_IN_PROGRESS');
      expect(executions.count).toBe(1);
    } finally {
      complete.mockRestore();
    }
  });

  describe('stored responses, audit and stale claims (review M1–M3)', () => {
    let su: pg.Client;
    const ledger = (key: string, body: Record<string, unknown>) =>
      post(key, { amountMinor: 100, ...body }, '/api/v1/test/ledger');
    const committed = async (ref: string) =>
      (
        await su.query(
          `SELECT count(*)::int AS n FROM outbox_event WHERE type = 'test.ledger' AND payload->>'ref' = $1`,
          [ref],
        )
      ).rows[0].n as number;
    const record = async (key: string) =>
      (
        await su.query(
          `SELECT status, attempt, committed_at, response_body FROM idempotency_record WHERE key = $1`,
          [key],
        )
      ).rows[0] as {
        status: string;
        attempt: number;
        committed_at: Date | null;
        response_body: unknown;
      };
    /** Pretend the lease ran out (the clock would, after LEASE_MS). */
    const expireLease = (key: string) =>
      su.query(
        `UPDATE idempotency_record SET locked_until = now() - interval '1 second' WHERE key = $1`,
        [key],
      );

    beforeAll(async () => {
      su = new pg.Client({ connectionString: inject('databaseUrls').superuser });
      await su.connect();
    });
    afterAll(async () => {
      await su.end();
    });

    it('M2: the stored and replayed body is the schema-filtered one the client got', async () => {
      const key = newId();
      const first = await ledger(key, { ref: `m2-${key}` });
      expect(first.status).toBe(201);
      expect(first.body).not.toHaveProperty('internalNote');
      expect((await record(key)).response_body).toEqual(first.body);
      const replay = await ledger(key, { ref: `m2-${key}` });
      expect(replay.body).toEqual(first.body);
    });

    it('M3: a replay writes no second audit row', async () => {
      const key = newId();
      const first = await ledger(key, { ref: `m3-${key}` });
      await ledger(key, { ref: `m3-${key}` });
      await ledger(key, { ref: `m3-${key}` });
      const { rows } = await su.query(
        `SELECT count(*)::int AS n FROM audit_log WHERE action = 'test.ledger_recorded' AND entity_id = $1`,
        [first.body.id],
      );
      expect(rows[0].n).toBe(1);
    });

    it('M1: every commit marks the claim, in the same transaction (single statement or transaction)', async () => {
      for (const inTransaction of [false, true]) {
        const key = newId();
        await ledger(key, { ref: `mark-${key}`, inTransaction });
        const r = await record(key);
        expect(r.status).toBe('COMPLETED');
        expect(r.committed_at).not.toBeNull();
      }
    });

    it('M1: a crash after the commit is never run again, even after the lease', async () => {
      const store = app.get(IdempotencyStore);
      const complete = vi.spyOn(store, 'complete').mockRejectedValueOnce(new Error('crash'));
      const key = newId();
      const ref = `after-commit-${key}`;
      try {
        expect((await ledger(key, { ref })).status).toBe(500);
      } finally {
        complete.mockRestore();
      }
      await expireLease(key);
      const retry = await ledger(key, { ref });
      expect(retry.status).toBe(409);
      expect(retry.body.error.code).toBe('IDEMPOTENCY_KEY_IN_PROGRESS');
      expect(await committed(ref)).toBe(1);
    });

    it('M1: a crash before any commit is taken over once the lease runs out', async () => {
      // The process "dies" after a handler that wrote nothing: the key is left IN_PROGRESS.
      const store = app.get(IdempotencyStore);
      const release = vi.spyOn(store, 'release').mockResolvedValueOnce(false);
      const key = newId();
      try {
        const first = await post(key, { amountMinor: 3 }, '/api/v1/test/failing-payments');
        expect(first.body.error.code).toBe('INVALID_STATE_TRANSITION');
      } finally {
        release.mockRestore();
      }
      expect((await record(key)).committed_at).toBeNull();
      // Still leased: the retry waits.
      const early = await post(key, { amountMinor: 3 }, '/api/v1/test/failing-payments');
      expect(early.body.error.code).toBe('IDEMPOTENCY_KEY_IN_PROGRESS');
      expect(executions.count).toBe(1);
      await expireLease(key);
      const retry = await post(key, { amountMinor: 3 }, '/api/v1/test/failing-payments');
      expect(retry.body.error.code).toBe('INVALID_STATE_TRANSITION'); // it ran again
      expect(executions.count).toBe(2);
    });

    it('M1: a slow attempt whose claim was taken over cannot commit (fencing)', async () => {
      const key = newId();
      const ref = `fence-${key}`;
      // supertest sends only when awaited: start the slow attempt now.
      const slow = ledger(key, { ref, delayMs: 1_500, inTransaction: true }).then((r) => r);
      await new Promise((r) => setTimeout(r, 400));
      await expireLease(key); // the lease "runs out" while the first attempt is still working
      const retry = await ledger(key, { ref, delayMs: 1_500, inTransaction: true });
      const first = await slow;
      expect(retry.status).toBe(201);
      expect(first.status).toBe(409);
      expect(first.body.error.code).toBe('IDEMPOTENCY_KEY_IN_PROGRESS');
      expect(await committed(ref)).toBe(1);
      expect((await record(key)).attempt).toBe(2);
    });

    it('M2: a handler that only read before failing releases its key; the client can retry', async () => {
      const key = newId();
      const ref = `read-${key}`;
      const first = await ledger(key, { ref, readThenFail: true });
      expect(first.body.error.code).toBe('INVALID_STATE_TRANSITION');
      expect(await record(key)).toBeUndefined(); // released
      const retry = await ledger(key, { ref, readThenFail: true });
      expect(retry.body.error.code).toBe('INVALID_STATE_TRANSITION'); // ran again, not "in progress"
      expect(executions.count).toBe(2);
    });

    it('M1: a failure after a commit keeps the key (the outcome is never run twice)', async () => {
      const key = newId();
      const ref = `partial-${key}`;
      const first = await ledger(key, { ref, failAfterCommit: true });
      expect(first.status).toBe(409);
      expect(first.body.error.code).toBe('INVALID_STATE_TRANSITION');
      await expireLease(key);
      const retry = await ledger(key, { ref, failAfterCommit: true });
      expect(retry.status).toBe(409);
      expect(retry.body.error.code).toBe('IDEMPOTENCY_KEY_IN_PROGRESS');
      expect(await committed(ref)).toBe(1);
    });
  });

  it('the same key is independent per route', async () => {
    const key = newId();
    await post(key, { amountMinor: 5 });
    const other = await post(key, { amountMinor: 5 }, '/api/v1/test/failing-payments');
    expect(other.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });
});
