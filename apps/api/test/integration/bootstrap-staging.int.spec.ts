import { decryptSecret, hashToken, loadMasterKeys } from '@academybee/auth';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { bootstrapStaging, stagingUsers } from '../../src/platform/cli/bootstrap-staging.js';
import { createTestApp, testConfig } from '../support/test-app.js';

/**
 * Staging bootstrap (C-78): academies, one user per role, the console admin, and one-time
 * set-password links delivered only through sealed outbox emails.
 */
const urls = inject('databaseUrls');
const INBOX = 'bootstrap-test@example.test';

describe('staging bootstrap', () => {
  let su: pg.Client;
  let app: INestApplication;
  const masterKey = testConfig().SECRETS_MASTER_KEY;
  const env = {
    APP_ENV: 'ci',
    PLATFORM_DATABASE_URL: urls.platform,
    SECRETS_MASTER_KEY: masterKey,
  };
  const run = (resend = false) =>
    bootstrapStaging({ inbox: INBOX, resend, allowEnvs: ['ci'] }, env);
  const emails = stagingUsers(INBOX).map((u) => u.email);

  /** The newest sealed link for an address, opened as the worker would. */
  const linkTokenFor = async (to: string): Promise<string> => {
    const { rows } = await su.query<{ payload: { link: { sealedToken: string } } }>(
      `SELECT payload FROM outbox_event WHERE payload->>'to' = $1 ORDER BY created_at DESC LIMIT 1`,
      [to],
    );
    return decryptSecret(rows[0]!.payload.link.sealedToken, loadMasterKeys(masterKey));
  };

  beforeAll(async () => {
    su = new pg.Client({ connectionString: urls.superuser });
    await su.connect();
    app = await createTestApp();
  });
  afterAll(async () => {
    await su.end();
    await app.close();
  });

  it('refuses every environment except staging unless explicitly allowed', async () => {
    await expect(bootstrapStaging({ inbox: INBOX }, env)).rejects.toThrow(/APP_ENV=staging/);
  });

  it('creates both academies, 13 users without passwords, and emails one link each', async () => {
    const outcome = await run();
    expect(outcome.academies).toEqual([
      { slug: 'demo-a', created: true },
      { slug: 'demo-b', created: true },
    ]);
    expect(outcome.users).toHaveLength(13);
    expect(outcome.users.every((u) => u.status === 'link-emailed')).toBe(true);
    expect(outcome.console).toEqual({
      email: 'bootstrap-test+console@example.test',
      status: 'link-emailed',
    });

    const { rows: roles } = await su.query(
      `SELECT t.slug, count(r.*)::int AS n FROM tenant t JOIN role r ON r.tenant_id = t.id
        WHERE t.slug IN ('demo-a','demo-b') GROUP BY t.slug ORDER BY t.slug`,
    );
    expect(roles).toEqual([
      { slug: 'demo-a', n: 7 },
      { slug: 'demo-b', n: 7 },
    ]);
    const { rows: teacher } = await su.query(
      `SELECT t.slug FROM membership m JOIN "user" u ON u.id = m.user_id JOIN tenant t ON t.id = m.tenant_id
        WHERE u.email = $1 AND m.status = 'ACTIVE' ORDER BY t.slug`,
      ['bootstrap-test+teacher@example.test'],
    );
    expect(teacher.map((r: { slug: string }) => r.slug)).toEqual(['demo-a', 'demo-b']);
    const { rows: creds } = await su.query(
      `SELECT count(*)::int AS n FROM user_credential c JOIN "user" u ON u.id = c.user_id
        WHERE u.email = ANY($1)`,
      [emails],
    );
    expect(creds[0].n).toBe(0);
  });

  it('stores links only as hashes and sealed tokens; the link sets a password and signs in', async () => {
    const to = 'bootstrap-test+a-owner@example.test';
    const token = await linkTokenFor(to);
    const { rows: mail } = await su.query(
      `SELECT payload FROM outbox_event WHERE payload->>'to' = $1`,
      [to],
    );
    expect(mail[0].payload).toMatchObject({
      template: 'account_setup',
      host: { kind: 'academy', slug: 'demo-a' },
    });
    expect(JSON.stringify(mail)).not.toContain(token);
    const { rows: stored } = await su.query(
      `SELECT token_hash FROM password_reset_token r JOIN "user" u ON u.id = r.user_id
        WHERE u.email = $1 AND r.used_at IS NULL`,
      [to],
    );
    expect(stored).toEqual([{ token_hash: hashToken(token) }]);

    const http = () => request(app.getHttpServer());
    const reset = await http()
      .post('/api/v1/auth/password/reset')
      .set('Host', 'demo-a.localhost')
      .send({ token, password: 'Harbour#Lantern2026' });
    expect(reset.status).toBe(204);
    const login = await http()
      .post('/api/v1/auth/login')
      .set('Host', 'demo-a.localhost')
      .send({ identifier: to, password: 'Harbour#Lantern2026' });
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({
      experience: 'manage',
      redirectTo: '/settings/security?prompt=mfa',
    });
  });

  it('is idempotent; --resend replaces the links of users without a password only', async () => {
    const again = await run();
    expect(again.academies.every((a) => !a.created)).toBe(true);
    const owner = again.users.find((u) => u.email === 'bootstrap-test+a-owner@example.test');
    expect(owner?.status).toBe('already-set-up');
    expect(again.users.filter((u) => u.status === 'link-pending')).toHaveLength(12);
    expect(again.console.status).toBe('link-pending');

    const parent = 'bootstrap-test+b-parent@example.test';
    const before = await linkTokenFor(parent);
    const resent = await run(true);
    expect(resent.users.find((u) => u.email === parent)?.status).toBe('link-emailed');
    expect(resent.users.find((u) => u.email === owner?.email)?.status).toBe('already-set-up');
    const after = await linkTokenFor(parent);
    expect(after).not.toBe(before);
    // The old link no longer works.
    const old = await request(app.getHttpServer())
      .post('/api/v1/auth/password/reset')
      .set('Host', 'demo-b.localhost')
      .send({ token: before, password: 'Harbour#Lantern2026' });
    expect(old.status).toBe(404);
  });
});
