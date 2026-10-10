import { OWNER_LEGAL_DOCUMENTS } from '@academybee/contracts';
import { addMemberFixture, createTenantFixture, FIXTURE_PASSWORD } from '@academybee/testing';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createTestApp } from '../support/test-app.js';

/** Terms, Privacy and DPA acceptance before onboarding (G-06, ADR-034). */
const urls = inject('databaseUrls');
const CURRENT_IDS = OWNER_LEGAL_DOCUMENTS.map((d) => d.id);
type Doc = { id: string; kind: string; version: string; accepted: boolean };
const docsOf = (res: { body: unknown }) => (res.body as { documents: Doc[] }).documents;

describe('legal acceptance', () => {
  let app: INestApplication;
  let su: pg.Client;

  beforeAll(async () => {
    app = await createTestApp();
    su = new pg.Client({ connectionString: urls.superuser });
    await su.connect();
  });
  afterAll(async () => {
    await su.end();
    await app.close();
  });

  async function session(host: string, email: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', host)
      .send({ identifier: email, password: FIXTURE_PASSWORD });
    expect(res.status, `sign-in ${email}`).toBe(200);
    const pairs = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .map((c) => c.split(';')[0]!);
    return {
      host,
      cookie: pairs.join('; '),
      csrf: pairs.find((p) => p.startsWith('ab_csrf='))?.slice('ab_csrf='.length) ?? '',
    };
  }
  type Session = Awaited<ReturnType<typeof session>>;
  const current = (s: Session) =>
    request(app.getHttpServer())
      .get('/api/v1/legal/current')
      .set('Host', s.host)
      .set('Cookie', s.cookie);
  const accept = (s: Session, documentIds: string[]) =>
    request(app.getHttpServer())
      .post('/api/v1/legal/accept')
      .set('Host', s.host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .send({ documentIds });

  it('the owner sees Terms, Privacy and DPA to accept, accepts once, and it is recorded', async () => {
    const a = await createTenantFixture(urls.migrator, { status: 'SETUP' });
    const s = await session(`${a.slug}.localhost`, a.user.email);

    const before = await current(s);
    expect(before.status).toBe(200);
    expect(before.body.complete).toBe(false);
    expect(docsOf(before).map((d) => d.kind)).toEqual(['TERMS', 'PRIVACY', 'DPA']);
    expect(docsOf(before).every((d) => !d.accepted)).toBe(true);

    const ids = docsOf(before).map((d) => d.id);
    const after = await accept(s, ids);
    expect(after.status).toBe(200);
    expect(after.body.complete).toBe(true);
    // Accepting again changes nothing (append-only, first acceptance stands).
    expect((await accept(s, ids)).status).toBe(200);

    const { rows } = await su.query(
      `SELECT tenant_id, locale FROM legal_acceptance WHERE user_id = $1`,
      [a.user.id],
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.tenant_id === a.id && r.locale === 'en-IN')).toBe(true);
    const audit = await su.query(
      `SELECT count(*)::int AS n FROM audit_log WHERE tenant_id = $1 AND action = 'legal.accepted'`,
      [a.id],
    );
    expect(audit.rows[0].n).toBe(1);
  });

  it("one person's acceptance is not another's", async () => {
    const a = await createTenantFixture(urls.migrator);
    const other = await addMemberFixture(urls.migrator, a.id, {
      email: `admin-${a.slug}@example.test`,
      roleKey: 'admin',
      grants: [],
    });
    const owner = await session(`${a.slug}.localhost`, a.user.email);
    await accept(owner, CURRENT_IDS);
    const res = await current(await session(`${a.slug}.localhost`, other.email));
    expect(res.body.complete).toBe(false);
  });

  it('refuses ids that are not current documents', async () => {
    const a = await createTenantFixture(urls.migrator);
    const s = await session(`${a.slug}.localhost`, a.user.email);
    const res = await accept(s, ['019a0000-0000-7000-8000-0000000fffff']);
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ path: 'documentIds', issue: 'not_current' }]);
  });

  it('a new version asks again', async () => {
    const a = await createTenantFixture(urls.migrator);
    const s = await session(`${a.slug}.localhost`, a.user.email);
    await accept(s, CURRENT_IDS);
    expect((await current(s)).body.complete).toBe(true);

    const v2 = '019a0000-0000-7000-8000-0000000000f2';
    await su.query(
      `INSERT INTO legal_document (id, kind, version, published_at, variants)
       VALUES ($1, 'TERMS', 'test-v2', now(), $2)`,
      [
        v2,
        JSON.stringify({
          'en-IN': { title: 'Terms v2', summary: 'Changed terms.', url: 'https://example.test/t2' },
        }),
      ],
    );
    try {
      const res = await current(s);
      expect(res.body.complete).toBe(false);
      expect(docsOf(res).find((d) => d.kind === 'TERMS')).toMatchObject({
        id: v2,
        version: 'test-v2',
        accepted: false,
      });
    } finally {
      await su.query(`DELETE FROM legal_acceptance WHERE document_id = $1`, [v2]);
      await su.query(`DELETE FROM legal_document WHERE id = $1`, [v2]);
    }
  });

  it('needs a signed-in user', async () => {
    const a = await createTenantFixture(urls.migrator);
    const res = await request(app.getHttpServer())
      .get('/api/v1/legal/current')
      .set('Host', `${a.slug}.localhost`);
    expect(res.status).toBe(401);
  });
});
