import { OWNER_LEGAL_DOCUMENTS } from '@academybee/contracts';
import { createTenantFixture, FIXTURE_PASSWORD, type TenantFixture } from '@academybee/testing';
import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createTestApp, testConfig } from '../support/test-app.js';

/**
 * Students' photos (G-05, G-06, C-97): private bucket only, presigned links of 5 minutes, every
 * view audited, consent-gated (`photos`), removed when that consent is withdrawn, isolated.
 */
const urls = inject('databaseUrls');
type Session = { host: string; cookie: string; csrf: string };

/** A real 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

describe('student photos', () => {
  let app: INestApplication;
  let su: pg.Client;
  let s3: Server;
  let a: TenantFixture;
  let owner: Session;
  const objects = new Map<string, Buffer>();
  const http = () => request(app.getHttpServer());

  async function signIn(t: TenantFixture): Promise<Session> {
    const host = `${t.slug}.localhost`;
    const res = await http()
      .post('/api/v1/auth/login')
      .set('Host', host)
      .send({ identifier: t.user.email, password: FIXTURE_PASSWORD });
    const pairs = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .map((c) => c.split(';')[0]!);
    const s = {
      host,
      cookie: pairs.join('; '),
      csrf: pairs.find((p) => p.startsWith('ab_csrf='))?.slice('ab_csrf='.length) ?? '',
    };
    await http()
      .post('/api/v1/legal/accept')
      .set('Host', host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .send({ documentIds: OWNER_LEGAL_DOCUMENTS.map((d) => d.id) });
    return s;
  }
  const req = (s: Session, method: 'get' | 'put' | 'delete' | 'post', path: string) =>
    http()
      [method](`/api/v1${path}`)
      .set('Host', s.host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf);
  const consent = (s: Session, action: 'GRANT' | 'WITHDRAW', purposes: string[]) =>
    req(s, 'post', `/students/${a.people.studentId}/consents`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ parentId: a.people.parentId, action, purposes, channel: 'PAPER' });
  const auditCount = async (action: string) =>
    Number(
      (
        await su.query<{ n: string }>(
          'SELECT count(*) AS n FROM audit_log WHERE action = $1 AND entity_id = $2',
          [action, a.people.studentId],
        )
      ).rows[0]!.n,
    );

  beforeAll(async () => {
    s3 = createServer((r: IncomingMessage, res) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => {
        const path = (r.url ?? '').split('?')[0]!;
        if (r.method === 'PUT') objects.set(path, Buffer.concat(chunks));
        if (r.method === 'DELETE') objects.delete(path);
        res.writeHead(r.method === 'DELETE' ? 204 : 200).end();
      });
    });
    await new Promise<void>((resolve) => s3.listen(0, '127.0.0.1', resolve));
    const port = (s3.address() as AddressInfo).port;
    app = await createTestApp(
      testConfig({
        MEDIA_S3_ENDPOINT: `http://127.0.0.1:${port}`,
        MEDIA_S3_ACCESS_KEY_ID: 'test-key',
        MEDIA_S3_SECRET_ACCESS_KEY: 'test-secret',
        MEDIA_PUBLIC_BUCKET: 'public-branding',
        MEDIA_PUBLIC_BASE_URL: 'https://media.example.test',
        MEDIA_PRIVATE_BUCKET: 'private-media',
      }),
    );
    su = new pg.Client({ connectionString: urls.superuser });
    await su.connect();
    a = await createTenantFixture(urls.migrator, { name: 'Photo Academy' });
  });
  afterAll(async () => {
    await su.end();
    await app.close();
    await new Promise((resolve) => s3.close(resolve));
  });
  beforeEach(async () => {
    const redis = new Redis(inject('redisUrl'));
    const keys = await redis.keys('rl:*');
    if (keys.length) await redis.del(...keys);
    await redis.quit();
    owner = await signIn(a);
  });

  it('needs photo consent; stores privately; links last 5 minutes and are audited; withdrawal removes it', async () => {
    const id = a.people.studentId;
    const refused = await req(owner, 'put', `/students/${id}/photo`)
      .set('content-type', 'image/png')
      .send(PNG);
    expect(refused.status).toBe(400);
    expect(refused.body.error.details).toEqual([{ path: 'photo', issue: 'consent_required' }]);

    expect((await consent(owner, 'GRANT', ['service', 'photos'])).status).toBe(201);
    const uploaded = await req(owner, 'put', `/students/${id}/photo`)
      .set('content-type', 'image/png')
      .send(PNG);
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(200);
    expect(uploaded.body).toMatchObject({ hasPhoto: true, photoConsent: true });
    const keys = [...objects.keys()];
    expect(keys.every((k) => k.startsWith(`/private-media/t/${a.id}/students/`))).toBe(true);
    expect(keys).toHaveLength(1);

    const before = await auditCount('student.photo_viewed');
    const link = await req(owner, 'get', `/students/${id}/photo`);
    expect(link.status).toBe(200);
    const url = new URL(link.body.url);
    expect(url.pathname).toBe(keys[0]);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
    expect(await auditCount('student.photo_viewed')).toBe(before + 1);

    // Not an image → refused by its bytes, whatever the header says.
    const fake = await req(owner, 'put', `/students/${id}/photo`)
      .set('content-type', 'image/png')
      .send(Buffer.from('<svg/>'));
    expect(fake.body.error.details).toEqual([{ path: 'photo', issue: 'unsupported_type' }]);

    // Withdrawing photo consent removes the photo and its file (G-06).
    expect((await consent(owner, 'WITHDRAW', ['photos'])).status).toBe(201);
    const after = await req(owner, 'get', `/students/${id}`);
    expect(after.body).toMatchObject({ hasPhoto: false, photoConsent: false });
    expect(objects.size).toBe(0);
    expect((await req(owner, 'get', `/students/${id}/photo`)).status).toBe(404);
  });

  it("another academy can't see, add or remove a photo", async () => {
    const b = await createTenantFixture(urls.migrator, { name: 'Other Photo Academy' });
    const other = await signIn(b);
    const id = a.people.studentId;
    expect((await req(other, 'get', `/students/${id}/photo`)).status).toBe(404);
    expect(
      (await req(other, 'put', `/students/${id}/photo`).set('content-type', 'image/png').send(PNG))
        .status,
    ).toBe(404);
    expect((await req(other, 'delete', `/students/${id}/photo`)).status).toBe(404);
  });
});
