import { newId } from '@academybee/contracts';
import { createTenantFixture, type TenantFixture } from '@academybee/testing';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { TenantResolver } from '../../src/core/tenant/tenant-resolver.service.js';
import { createTestApp, testConfig } from '../support/test-app.js';

/** Tenant resolution from the request host (ARCHITECTURE §5.2–5.3, PRD v3.1 §C, §F, §J). */
describe('tenant resolution', () => {
  const urls = inject('databaseUrls');
  const SECRET = 'test-proxy-secret-0123';
  let app: INestApplication;
  let active: TenantFixture;
  let other: TenantFixture;
  let suspended: TenantFixture;
  let archived: TenantFixture;
  let setup: TenantFixture;

  async function asMigrator(tenantId: string, sql: string, params: unknown[]) {
    const client = new pg.Client({ connectionString: urls.migrator });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      await client.query(sql, params);
      await client.query('COMMIT');
    } finally {
      await client.end();
    }
  }

  const get = (path: string, host: string) =>
    request(app.getHttpServer()).get(path).set('Host', host);
  const context = (host: string) => get('/api/v1/tenant/context', host);
  const probe = (host: string) => get('/api/v1/test/academy/probe', host);

  beforeAll(async () => {
    [active, other, suspended, archived, setup] = await Promise.all([
      createTenantFixture(urls.migrator, { name: 'Resolution Academy', primaryColor: '#1F6F5C' }),
      createTenantFixture(urls.migrator),
      createTenantFixture(urls.migrator, { status: 'SUSPENDED', name: 'Paused Academy' }),
      createTenantFixture(urls.migrator, { status: 'ARCHIVED', name: 'Closed Academy' }),
      createTenantFixture(urls.migrator, { status: 'SETUP' }),
    ]);
    // Old slug of `active` (REDIRECT) and two custom domains (verified / pending).
    await asMigrator(
      active.id,
      `INSERT INTO tenant_domain (id, tenant_id, hostname, kind, role, verification, updated_at)
       VALUES ($1, $2, $3, 'SUBDOMAIN', 'REDIRECT', 'VERIFIED', now()),
              ($4, $2, $5, 'CUSTOM', 'ALIAS', 'VERIFIED', now()),
              ($6, $2, $7, 'CUSTOM', 'ALIAS', 'PENDING', now())`,
      [
        newId(),
        active.id,
        `old-${active.slug}`,
        newId(),
        `www.${active.slug}.example.com`,
        newId(),
        `pending.${active.slug}.example.com`,
      ],
    );
    app = await createTestApp(
      testConfig({
        TENANT_CACHE_MS: '0',
        TENANT_NEGATIVE_CACHE_MS: '0',
        CUSTOM_DOMAINS_ENABLED: 'true',
      }),
    );
  });
  afterAll(async () => {
    await app.close();
  });

  it('an ACTIVE academy host returns its public identity and no internal IDs', async () => {
    const res = await context(`${active.slug}.localhost:3000`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ACTIVE',
      slug: active.slug,
      displayName: 'Resolution Academy',
      timezone: 'Asia/Kolkata',
      locale: 'en-IN',
      branding: { primaryColor: '#1F6F5C', secondaryColor: null, hasLogo: false },
    });
    expect(JSON.stringify(res.body)).not.toContain(active.id);
  });

  it('upper case, a port and a trailing dot resolve the same academy', async () => {
    const res = await context(`${active.slug.toUpperCase()}.LOCALHOST.:3000`);
    expect(res.body.slug).toBe(active.slug);
  });

  it.each([
    ['unknown academy', 'no-such-academy.localhost'],
    ['IP address', '127.0.0.1:4000'],
    ['nested subdomain', 'a.b.localhost'],
    ['punycode', 'xn--80ak6aa92e.localhost'],
    ['marketing host', 'localhost'],
    ['console host', 'console.localhost'],
    ['Family Hub host', 'app.localhost'],
    ['unverified custom domain', 'pending.example.com'],
  ])('%s → 404 on the context and on academy routes', async (_, host) => {
    const resolvedHost =
      host === 'pending.example.com' ? `pending.${active.slug}.example.com` : host;
    for (const res of [await context(resolvedHost), await probe(resolvedHost)]) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
  });

  it('a verified custom domain serves the same academy (PRD v3.1 §G)', async () => {
    const res = await probe(`www.${active.slug}.example.com`);
    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(active.id);
  });

  it('an old slug (REDIRECT) answers with the primary host and serves no academy routes', async () => {
    expect((await context(`old-${active.slug}.localhost`)).body).toEqual({
      status: 'REDIRECT',
      host: `${active.slug}.localhost`,
    });
    expect((await probe(`old-${active.slug}.localhost`)).status).toBe(404);
  });

  it('SUSPENDED: context shows the name only; operational routes → 403 TENANT_UNAVAILABLE', async () => {
    expect((await context(`${suspended.slug}.localhost`)).body).toEqual({
      status: 'SUSPENDED',
      displayName: 'Paused Academy',
    });
    const res = await probe(`${suspended.slug}.localhost`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TENANT_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toMatch(/SUSPENDED|Paused|tenant_id|tenantId/i);
  });

  it('ARCHIVED: context shows the status only; operational routes → 403', async () => {
    expect((await context(`${archived.slug}.localhost`)).body).toEqual({ status: 'ARCHIVED' });
    expect((await probe(`${archived.slug}.localhost`)).status).toBe(403);
  });

  it('SETUP academies are served (onboarding happens there)', async () => {
    expect((await context(`${setup.slug}.localhost`)).body.status).toBe('SETUP');
    expect((await probe(`${setup.slug}.localhost`)).status).toBe(200);
  });

  it('routes may opt into other statuses explicitly', async () => {
    const res = await get('/api/v1/test/academy/any-status', `${suspended.slug}.localhost`);
    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(suspended.id);
  });

  it('honours X-Forwarded-Host only with the proxy secret (C-46)', async () => {
    const forged = await request(app.getHttpServer())
      .get('/api/v1/test/academy/probe')
      .set('Host', `${active.slug}.localhost`)
      .set('X-Forwarded-Host', `${other.slug}.localhost`);
    expect(forged.body.tenantId).toBe(active.id);
    const proxied = await request(app.getHttpServer())
      .get('/api/v1/test/academy/probe')
      .set('Host', 'api.internal:4000')
      .set('X-Forwarded-Host', `${other.slug}.localhost`)
      .set('X-AB-Proxy-Secret', SECRET);
    expect(proxied.body.tenantId).toBe(other.id);
  });

  it('custom domains are unknown without a lookup while the feature is off (review M3)', async () => {
    const off = await createTestApp(testConfig());
    try {
      const res = await request(off.getHttpServer())
        .get('/api/v1/tenant/context')
        .set('Host', `www.${active.slug}.example.com`);
      expect(res.status).toBe(404);
    } finally {
      await off.close();
    }
  });

  it('health checks do not depend on the host', async () => {
    expect((await get('/api/v1/health/live', 'whatever.invalid')).status).toBe(200);
  });
});

describe('tenant resolution cache', () => {
  const urls = inject('databaseUrls');
  let app: INestApplication;
  let tenant: TenantFixture;

  beforeAll(async () => {
    tenant = await createTenantFixture(urls.migrator);
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('caches a resolution and drops it when the academy is invalidated', async () => {
    const host = `${tenant.slug}.localhost`;
    const status = async () =>
      (await request(app.getHttpServer()).get('/api/v1/tenant/context').set('Host', host)).body
        .status as string;
    expect(await status()).toBe('ACTIVE');

    const su = new pg.Client({ connectionString: urls.superuser });
    await su.connect();
    await su.query(`UPDATE tenant SET status = 'SUSPENDED' WHERE id = $1`, [tenant.id]);
    await su.end();

    expect(await status()).toBe('ACTIVE'); // still cached (TTL 60 s)
    await app.get(TenantResolver).invalidateTenant(tenant.id);
    expect(await status()).toBe('SUSPENDED');
  });
});
