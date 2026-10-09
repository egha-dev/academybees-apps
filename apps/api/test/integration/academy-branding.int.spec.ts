import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  addMemberFixture,
  createTenantFixture,
  FIXTURE_PASSWORD,
  type TenantFixture,
} from '@academybee/testing';
import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createTestApp, testConfig } from '../support/test-app.js';

/**
 * Settings → Academy and Branding & Domain (UX v1.1 §6; C-49, C-93, C-97). Object storage is an
 * in-process S3 stand-in that records the signed requests the API sends (the real R2/SeaweedFS
 * protocol is the same; E2E uses SeaweedFS).
 */
const urls = inject('databaseUrls');

type Recorded = {
  method: string;
  path: string;
  type?: string | undefined;
  auth?: string | undefined;
  size: number;
  cache?: string | undefined;
};

const png = (w = 256, h = 128, extra = 0) => {
  const b = Buffer.alloc(33 + extra);
  Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  ]).copy(b);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};

describe('academy settings and branding', () => {
  let app: INestApplication;
  let bare: INestApplication;
  let s3: Server;
  let su: pg.Client;
  const recorded: Recorded[] = [];
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    s3 = createServer((req: IncomingMessage, res) => {
      let size = 0;
      req.on('data', (c: Buffer) => (size += c.length));
      req.on('end', () => {
        recorded.push({
          method: req.method ?? '',
          path: req.url ?? '',
          type: req.headers['content-type'],
          auth: req.headers.authorization,
          size,
          cache: req.headers['cache-control'],
        });
        res.writeHead(req.method === 'DELETE' ? 204 : 200).end();
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
      }),
    );
    bare = await createTestApp();
    su = new pg.Client({ connectionString: urls.superuser });
    await su.connect();
  });
  afterAll(async () => {
    await su.end();
    await app.close();
    await bare.close();
    await new Promise((resolve) => s3.close(resolve));
  });
  beforeEach(async () => {
    recorded.length = 0;
    const redis = new Redis(inject('redisUrl'));
    const keys = await redis.keys('rl:*');
    if (keys.length) await redis.del(...keys);
    await redis.quit();
  });

  async function signIn(t: TenantFixture, email = t.user.email, on = app) {
    const host = `${t.slug}.localhost`;
    const res = await request(on.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', host)
      .send({ identifier: email, password: FIXTURE_PASSWORD });
    expect(res.status).toBe(200);
    const pairs = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .map((c) => c.split(';')[0]!);
    return {
      host,
      cookie: pairs.join('; '),
      csrf: pairs.find((p) => p.startsWith('ab_csrf='))?.slice('ab_csrf='.length) ?? '',
    };
  }
  type S = Awaited<ReturnType<typeof signIn>>;
  const upload = (s: S, kind: 'logo' | 'favicon', body: Buffer, type = 'image/png', on = app) =>
    request(on.getHttpServer())
      .put(`/api/v1/academy/branding/${kind}`)
      .set('Host', s.host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .set('Content-Type', type)
      .send(body);
  const patch = (s: S, path: string, body: object) =>
    http()
      .patch(`/api/v1/academy/${path}`)
      .set('Host', s.host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .send(body);
  const get = (s: S, path: string) =>
    http().get(`/api/v1/academy/${path}`).set('Host', s.host).set('Cookie', s.cookie);

  it('a logo upload is checked, stored under a new public key, and shown everywhere', async () => {
    const t = await createTenantFixture(urls.migrator);
    const s = await signIn(t);
    const res = await upload(s, 'logo', png());
    expect(res.status).toBe(200);
    expect(res.body.logoUrl).toMatch(
      new RegExp(`^https://media\\.example\\.test/t/${t.id}/branding/[0-9a-f-]{36}\\.png$`),
    );
    const put = recorded.find((r) => r.method === 'PUT')!;
    expect(put.path).toMatch(
      new RegExp(`^/public-branding/t/${t.id}/branding/[0-9a-f-]{36}\\.png$`),
    );
    expect(put).toMatchObject({
      type: 'image/png',
      size: 33,
      cache: 'public, max-age=31536000, immutable',
    });
    expect(put.auth).toMatch(/^AWS4-HMAC-SHA256 Credential=test-key\//);

    const ctx = await http().get('/api/v1/tenant/context').set('Host', s.host);
    expect(ctx.body.branding).toMatchObject({ hasLogo: true, logoUrl: res.body.logoUrl });
    const rows = await su.query(
      `SELECT purpose, visibility, mime_type, width, height, status FROM media_file WHERE tenant_id=$1 AND status='READY'`,
      [t.id],
    );
    expect(rows.rows).toEqual([
      {
        purpose: 'branding.logo',
        visibility: 'PUBLIC',
        mime_type: 'image/png',
        width: 256,
        height: 128,
        status: 'READY',
      },
    ]);

    // A new logo replaces the old one; the old object is deleted from storage.
    recorded.length = 0;
    const again = await upload(s, 'logo', png(64, 64));
    expect(again.body.logoUrl).not.toBe(res.body.logoUrl);
    expect(recorded.map((r) => r.method)).toEqual(['PUT', 'DELETE']);
    expect(recorded[1]!.path).toBe(
      `/public-branding${new URL(res.body.logoUrl as string).pathname}`,
    );

    // Removing it goes back to the monogram.
    const removed = await http()
      .delete('/api/v1/academy/branding/logo')
      .set('Host', s.host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf);
    expect(removed.body.logoUrl).toBeNull();
    const audit = await su.query(
      `SELECT action FROM audit_log WHERE tenant_id=$1 AND action LIKE 'academy.logo_%' ORDER BY created_at`,
      [t.id],
    );
    expect(audit.rows.map((r: { action: string }) => r.action)).toEqual([
      'academy.logo_uploaded',
      'academy.logo_uploaded',
      'academy.logo_removed',
    ]);
  });

  it('refuses what is not a real PNG/JPEG/WebP, whatever the browser claims, and oversized files', async () => {
    const t = await createTenantFixture(urls.migrator);
    const s = await signIn(t);
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const spoofed = await upload(s, 'logo', svg, 'image/png');
    expect(spoofed.status).toBe(400);
    expect(spoofed.body.error.details).toEqual([{ path: 'file', issue: 'unsupported_type' }]);
    const big = await upload(s, 'favicon', png(64, 64, 600 * 1024));
    expect(big.body.error.details).toEqual([{ path: 'file', issue: 'too_large' }]);
    const huge = await upload(s, 'logo', png(8000, 100));
    expect(huge.body.error.details).toEqual([{ path: 'file', issue: 'too_large_dimensions' }]);
    expect(recorded).toEqual([]);
  });

  it('without storage configured, uploads say so instead of pretending (C-97)', async () => {
    const t = await createTenantFixture(urls.migrator);
    const s = await signIn(t, t.user.email, bare);
    const res = await upload(s, 'logo', png(), 'image/png', bare);
    expect(res.status).toBe(503);
    expect(res.body.error.details).toEqual([{ path: 'file', issue: 'uploads_unavailable' }]);
    const branding = await request(bare.getHttpServer())
      .get('/api/v1/academy/branding')
      .set('Host', s.host)
      .set('Cookie', s.cookie);
    expect(branding.body.uploadsAvailable).toBe(false);
  });

  it('the brand colour must carry readable text (C-49); saving is versioned', async () => {
    const t = await createTenantFixture(urls.migrator);
    const s = await signIn(t);
    const start = await get(s, 'branding');
    expect(start.body).toMatchObject({
      host: `${t.slug}.localhost`,
      uploadsAvailable: true,
      publicProfile: { enabled: false },
    });
    const grey = await patch(s, 'branding', {
      version: start.body.version,
      primaryColor: '#7A7A7A',
    });
    expect(grey.status).toBe(400);
    expect(grey.body.error.details).toEqual([{ path: 'primaryColor', issue: 'low_contrast' }]);
    const ok = await patch(s, 'branding', {
      version: start.body.version,
      primaryColor: '#9c3d54',
      publicProfileEnabled: true,
    });
    expect(ok.body).toMatchObject({ primaryColor: '#9C3D54', publicProfile: { enabled: true } });
    expect(
      (await patch(s, 'branding', { version: start.body.version, primaryColor: '#1F6F5C' })).status,
    ).toBe(409);
    const ctx = await http().get('/api/v1/tenant/context').set('Host', s.host);
    expect(ctx.body.branding.primaryColor).toBe('#9C3D54');
  });

  it('academy profile: name, contact, timezone; stale versions are refused', async () => {
    const t = await createTenantFixture(urls.migrator);
    const s = await signIn(t);
    const before = await get(s, 'settings');
    const res = await patch(s, 'settings', {
      version: before.body.version,
      name: 'Natya Kala',
      phone: '9840012345',
      timezone: 'Asia/Kolkata',
    });
    expect(res.body).toMatchObject({
      name: 'Natya Kala',
      phone: '+919840012345',
      timezone: 'Asia/Kolkata',
    });
    const stale = await patch(s, 'settings', { version: before.body.version, name: 'Other' });
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    expect((await http().get('/api/v1/tenant/context').set('Host', s.host)).body.displayName).toBe(
      'Natya Kala',
    );
  });

  it('admins read; only branding managers change; academies are isolated', async () => {
    const t = await createTenantFixture(urls.migrator);
    const admin = await addMemberFixture(urls.migrator, t.id, {
      email: `admin-${t.slug}@example.test`,
      roleKey: 'reader',
      grants: [{ capability: 'academy.settings.read', scope: 'TENANT' }],
    });
    const s = await signIn(t, admin.email);
    expect((await get(s, 'branding')).status).toBe(200);
    expect((await upload(s, 'logo', png())).status).toBe(403);
    expect((await patch(s, 'branding', { version: 1, primaryColor: '#1F6F5C' })).status).toBe(403);
    const other = await createTenantFixture(urls.migrator);
    const cross = await http()
      .get('/api/v1/academy/branding')
      .set('Host', `${other.slug}.localhost`)
      .set('Cookie', s.cookie);
    expect(cross.body.error.code).toBe('TENANT_MISMATCH');
  });
});
