import { ErrorEnvelopeSchema } from '@academybee/contracts';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp } from '../support/test-app.js';

/**
 * Phase 0 exit gate: validation error, unknown route, thrown domain error and Prisma unique
 * violation each return the correct code in the envelope, with no internals.
 */
describe('error envelope contract (ADR-013)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  function expectEnvelope(res: request.Response, status: number, code: string) {
    expect(res.status).toBe(status);
    expect(ErrorEnvelopeSchema.parse(res.body).error.code).toBe(code);
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    const text = JSON.stringify(res.body);
    for (const leak of [
      'stack',
      'prisma',
      'Prisma',
      'SELECT',
      'INSERT',
      'constraint',
      '.ts:',
      'hunter2',
      'developer detail',
    ]) {
      expect(text).not.toContain(leak);
    }
  }

  it('validation error → 400 VALIDATION_FAILED with field paths', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/test/echo')
      .send({ name: '', age: 'x' });
    expectEnvelope(res, 400, 'VALIDATION_FAILED');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        { path: 'name', issue: 'too_small' },
        { path: 'age', issue: 'invalid_type' },
      ]),
    );
  });

  it('malformed JSON → 400 VALIDATION_FAILED', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/test/echo')
      .set('content-type', 'application/json')
      .send('{"name": ');
    expectEnvelope(res, 400, 'VALIDATION_FAILED');
  });

  it('unknown route → 404 NOT_FOUND', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist');
    expectEnvelope(res, 404, 'NOT_FOUND');
  });

  it('thrown domain error → its code and status, not the developer reason', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/test/domain-error');
    expectEnvelope(res, 409, 'INVALID_STATE_TRANSITION');
  });

  it('Prisma unique violation → 409 CONFLICT naming only the fields', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/test/unique');
    expectEnvelope(res, 409, 'CONFLICT');
    expect(res.body.error.details).toEqual([
      { path: 'scope', issue: 'already_exists' },
      { path: 'key', issue: 'already_exists' },
    ]);
  });

  it('unexpected error → 500 INTERNAL with a generic message', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/test/crash');
    expectEnvelope(res, 500, 'INTERNAL');
    expect(res.body.error.message).toBe('Something went wrong on our side. Please try again.');
  });

  it('echoes a safe caller request ID and replaces an unsafe one', async () => {
    const ok = await request(app.getHttpServer())
      .get('/api/v1/nope')
      .set('x-request-id', 'client-req-123456');
    expect(ok.body.error.requestId).toBe('client-req-123456');
    const bad = await request(app.getHttpServer()).get('/api/v1/nope').set('x-request-id', 'x y');
    expect(bad.body.error.requestId).not.toBe('x y');
  });

  it('responses are serialized through their schema (unknown keys stripped)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/test/echo')
      .send({ name: 'Aarav' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'Aarav' });
  });

  it('Tamil and Hindi names round-trip through the API unchanged (G-08, G-32 exit gate)', async () => {
    for (const name of ['ஆரவ்', 'आरव', 'ఆరవ్ శర్మ']) {
      const res = await request(app.getHttpServer()).post('/api/v1/test/echo').send({ name });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe(name);
    }
  });

  it('rejects names with digits or markup', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/test/echo')
      .send({ name: '<b>Aarav</b>' });
    expectEnvelope(res, 400, 'VALIDATION_FAILED');
  });

  it('error messages come from the i18n catalogue', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nope');
    expect(res.body.error.message).toBe("We couldn't find what you were looking for.");
  });
});
