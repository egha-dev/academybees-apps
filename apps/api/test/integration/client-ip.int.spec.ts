import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp } from '../support/test-app.js';

/** Review M4: client IP and host as stored by the real request-context middleware. */
describe('request context behind the proxy', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  const context = () => request(app.getHttpServer()).get('/api/v1/test/request-context');

  it('takes X-Forwarded-For and X-Forwarded-Host from the proxy (secret present)', async () => {
    const res = await context()
      .set('X-Forwarded-For', '198.51.100.7, 10.0.0.1')
      .set('X-Forwarded-Host', 'Demo-X.localhost:3000')
      .set('X-AB-Proxy-Secret', 'test-proxy-secret-0123');
    expect(res.body).toEqual({ ip: '198.51.100.7', host: 'demo-x.localhost:3000' });
  });

  it('ignores both headers from a direct caller', async () => {
    const res = await context()
      .set('Host', 'direct.localhost')
      .set('X-Forwarded-For', '198.51.100.8')
      .set('X-Forwarded-Host', 'evil.localhost');
    expect(res.body.host).toBe('direct.localhost');
    expect(res.body.ip).not.toBe('198.51.100.8');
    expect(res.body.ip).toMatch(/^(127\.0\.0\.1|::1)$/);
  });

  it('never stores a forwarded value that is not an IP', async () => {
    const res = await context()
      .set('X-Forwarded-For', '<script>')
      .set('X-AB-Proxy-Secret', 'test-proxy-secret-0123');
    expect(res.body.ip).toMatch(/^(127\.0\.0\.1|::1)$/);
  });
});
