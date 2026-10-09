import { newId } from '@academybee/contracts';
import { createTenantFixture, FIXTURE_PASSWORD } from '@academybee/testing';
import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { CONSOLE_HOST, consoleSession, type ConsoleSession } from '../support/console-session.js';
import { createTestApp } from '../support/test-app.js';

/**
 * Provisioning (PRD v3.1 §B, C-02, C-88, C-89): one transaction, idempotent, one winner per
 * subdomain, nothing left behind on failure, audited, and the owner's invitation queued.
 */
const urls = inject('databaseUrls');

describe('provisioning an academy', () => {
  let app: INestApplication;
  let su: pg.Client;
  let admin: ConsoleSession;
  const http = () => request(app.getHttpServer());

  const create = (body: Record<string, unknown>, key = newId(), s = admin) =>
    http()
      .post('/api/v1/platform/tenants')
      .set('Host', CONSOLE_HOST)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .set('Idempotency-Key', key)
      .send(body);
  const slugOf = () => `acad-${newId().slice(-10)}`;
  const academy = (slug = slugOf(), extra: Record<string, unknown> = {}) => ({
    name: 'Gurushethra Natya Academy',
    academyType: 'dance',
    slug,
    owner: { name: 'Lakshmi Raman', email: `owner-${slug}@example.test` },
    ...extra,
  });
  const count = async (sql: string, params: unknown[]) =>
    (await su.query<{ n: number }>(sql, params)).rows[0]!.n;

  beforeAll(async () => {
    app = await createTestApp();
    su = new pg.Client({ connectionString: urls.superuser });
    await su.connect();
    admin = await consoleSession(app, urls.superuser);
  });
  afterAll(async () => {
    await su.end();
    await app.close();
  });
  beforeEach(async () => {
    const redis = new Redis(inject('redisUrl'));
    const keys = await redis.keys('rl:*');
    if (keys.length) await redis.del(...keys);
    await redis.quit();
  });

  it('creates the academy in SETUP with everything it needs, in one go', async () => {
    const slug = slugOf();
    const res = await create(academy(slug, { planKey: 'growth', branchName: 'Anna Nagar' }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Gurushethra Natya Academy',
      slug,
      host: `${slug}.localhost`,
      status: 'SETUP',
      academyType: 'dance',
      planKey: 'growth',
      plan: { key: 'growth', status: 'TRIAL' },
      owner: {
        name: 'Lakshmi Raman',
        email: `owner-${slug}@example.test`,
        invitation: { status: 'PENDING' },
      },
      onboarding: { currentStep: 'profile', completedSteps: 0, totalSteps: 7, completedAt: null },
      domains: [{ host: `${slug}.localhost`, role: 'PRIMARY', kind: 'SUBDOMAIN' }],
    });
    const id = res.body.id as string;
    expect(
      await count(
        `SELECT count(*)::int n FROM branch WHERE tenant_id=$1 AND is_default AND name='Anna Nagar'`,
        [id],
      ),
    ).toBe(1);
    expect(await count(`SELECT count(*)::int n FROM role WHERE tenant_id=$1`, [id])).toBe(7);
    expect(
      (await su.query(`SELECT terminology FROM tenant_settings WHERE tenant_id=$1`, [id])).rows[0]
        .terminology,
    ).toEqual({ batch: 'class', course: 'course', teacher: 'teacher' });
    const sub = (
      await su.query(`SELECT entitlements, trial_ends_at FROM subscription WHERE tenant_id=$1`, [
        id,
      ])
    ).rows[0];
    expect(sub.entitlements.limits.students).toBe(300);
    expect(new Date(sub.trial_ends_at).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    const audit = await su.query(
      `SELECT actor_type, actor_id, tenant_id FROM audit_log WHERE action='platform.tenant_provisioned' AND entity_id=$1`,
      [id],
    );
    expect(audit.rows).toEqual([
      { actor_type: 'PLATFORM_STAFF', actor_id: admin.userId, tenant_id: id },
    ]);
    const mail = await su.query(
      `SELECT payload FROM outbox_event WHERE type='email.requested' AND payload->>'to'=$1`,
      [`owner-${slug}@example.test`],
    );
    expect(mail.rows[0].payload).toMatchObject({
      template: 'owner_invite',
      host: { kind: 'academy', slug },
      vars: { owner: 'Lakshmi Raman' },
    });
    expect(JSON.stringify(mail.rows[0].payload)).toMatch(/"sealedToken":"ab1\./);
    expect(
      await count(
        `SELECT count(*)::int n FROM outbox_event WHERE type='analytics.event' AND payload->>'name'='academy.provisioned' AND tenant_id=$1`,
        [id],
      ),
    ).toBe(1);
  });

  it('the same Idempotency-Key twice gives one academy and the same answer', async () => {
    const key = newId();
    const body = academy();
    const first = await create(body, key);
    const second = await create(body, key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(await count(`SELECT count(*)::int n FROM tenant WHERE slug=$1`, [body.slug])).toBe(1);
  });

  it('two creators racing for one subdomain: one wins, the other gets 409 with suggestions', async () => {
    const slug = slugOf();
    const [a, b] = await Promise.all([create(academy(slug)), create(academy(slug))]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.error.code).toBe('CONFLICT');
    expect(loser.body.error.details[0]).toEqual({ path: 'slug', issue: 'taken' });
    expect(
      (loser.body as { error: { details: { path: string }[] } }).error.details.filter(
        (d) => d.path === 'suggestions',
      ).length,
    ).toBeGreaterThan(0);
    expect(await count(`SELECT count(*)::int n FROM tenant WHERE slug=$1`, [slug])).toBe(1);
  });

  it.each([
    ['admin', 'reserved'],
    ['www', 'reserved'],
    ['paytm-classes', 'reserved'],
    ['ab', 'too_short'],
    ['Bad_Slug', 'format'],
    ['xn--abc', 'double_hyphen'],
  ])('refuses the subdomain %s (%s)', async (slug, issue) => {
    const res = await create(academy(slug));
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ path: 'slug', issue }]);
  });

  it('an old subdomain (now a redirect) stays reserved for its academy', async () => {
    const t = await createTenantFixture(urls.migrator);
    const old = `old-${t.slug}`;
    await su.query(
      `INSERT INTO tenant_domain (id, tenant_id, hostname, kind, role, verification, updated_at)
       VALUES ($1, $2, $3, 'SUBDOMAIN', 'REDIRECT', 'VERIFIED', now())`,
      [newId(), t.id, old],
    );
    const res = await create(academy(old));
    expect(res.status).toBe(409);
  });

  it('a failure part-way leaves nothing behind', async () => {
    // Make the subscription insert — late in the transaction, after the academy, its domain,
    // roles and owner invitation — fail, then check none of those rows survived.
    const bad = slugOf();
    await su.query(
      `ALTER TABLE subscription ADD CONSTRAINT test_no_starter CHECK (plan_key <> 'starter')`,
    );
    try {
      const failed = await create(academy(bad, { planKey: 'starter' }));
      expect(failed.status).toBe(500);
      expect(failed.body.error.code).toBe('INTERNAL');
    } finally {
      await su.query(`ALTER TABLE subscription DROP CONSTRAINT test_no_starter`);
    }
    for (const table of ['tenant', 'tenant_domain'])
      expect(
        await count(
          table === 'tenant'
            ? `SELECT count(*)::int n FROM tenant WHERE slug=$1`
            : `SELECT count(*)::int n FROM tenant_domain WHERE hostname=$1`,
          [bad],
        ),
        table,
      ).toBe(0);
    expect(
      await count(`SELECT count(*)::int n FROM invitation WHERE email=$1`, [
        `owner-${bad}@example.test`,
      ]),
    ).toBe(0);
    expect(
      await count(`SELECT count(*)::int n FROM outbox_event WHERE payload->>'to'=$1`, [
        `owner-${bad}@example.test`,
      ]),
    ).toBe(0);
  });

  it('validates names: any script, but letters required', async () => {
    const tamil = await create(academy(slugOf(), { name: 'குருக்ஷேத்ரா நடனப் பள்ளி' }));
    expect(tamil.status).toBe(201);
    expect(tamil.body.name).toBe('குருக்ஷேத்ரா நடனப் பள்ளி');
    const digits = await create(academy(slugOf(), { name: '12345' }));
    expect(digits.status).toBe(400);
    expect(digits.body.error.details).toEqual([{ path: 'name', issue: 'invalid' }]);
  });

  it('the owner accepts the invitation on the academy host and becomes its owner', async () => {
    const slug = slugOf();
    const res = await create(academy(slug));
    const id = res.body.id as string;
    // The emailed token is sealed; give the invitation a known token to accept it here.
    const token = 'owner-test-token-'.padEnd(43, 'x');
    const { createHash } = await import('node:crypto');
    await su.query(`UPDATE invitation SET token_hash=$1 WHERE tenant_id=$2`, [
      createHash('sha256').update(token).digest('hex'),
      id,
    ]);
    const preview = await http()
      .post('/api/v1/invitations/preview')
      .set('Host', `${slug}.localhost`)
      .send({ token });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ roles: ['owner'], accountExists: false });
    const accepted = await http()
      .post('/api/v1/invitations/accept')
      .set('Host', `${slug}.localhost`)
      .send({ token, name: 'Lakshmi Raman', password: FIXTURE_PASSWORD });
    expect(accepted.status).toBe(200);
    const detail = await http()
      .get(`/api/v1/platform/tenants/${id}`)
      .set('Host', CONSOLE_HOST)
      .set('Cookie', admin.cookie);
    expect(detail.body.owner).toMatchObject({
      name: 'Lakshmi Raman',
      invitation: { status: 'ACCEPTED' },
    });
  });

  it('live availability: available, taken with suggestions, reserved, invalid', async () => {
    const t = await createTenantFixture(urls.migrator);
    const check = (slug: string) =>
      http()
        .get('/api/v1/platform/slug-availability')
        .query({ slug })
        .set('Host', CONSOLE_HOST)
        .set('Cookie', admin.cookie);
    expect((await check(slugOf())).body).toMatchObject({ status: 'available', suggestions: [] });
    const taken = await check(t.slug);
    expect(taken.body.status).toBe('taken');
    expect(taken.body.suggestions).toContain(`${t.slug}-academy`);
    expect((await check('admin')).body.status).toBe('reserved');
    expect((await check('ab')).body).toMatchObject({ status: 'invalid', problem: 'too_short' });
  });
});
