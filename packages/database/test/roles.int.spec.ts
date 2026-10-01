import { newId } from '@academybee/contracts';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

const urls = inject('databaseUrls');

async function connect(url: string) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

describe('database roles and grants (ADR-005, ADR-027)', () => {
  let app: pg.Client;
  let migrator: pg.Client;
  const auditId = newId();

  beforeAll(async () => {
    app = await connect(urls.app);
    migrator = await connect(urls.migrator);
    await app.query(
      `INSERT INTO audit_log (id, actor_type, action) VALUES ($1, 'SYSTEM', 'test.insert')`,
      [auditId],
    );
  });

  afterAll(async () => {
    await app.end();
    await migrator.end();
  });

  it('ab_app can insert platform audit rows but not read them back (review L8)', async () => {
    const { rows } = await app.query('SELECT action FROM audit_log WHERE id = $1', [auditId]);
    expect(rows).toEqual([]);
    const su = await connect(urls.superuser);
    try {
      const { rows: stored } = await su.query('SELECT action FROM audit_log WHERE id = $1', [
        auditId,
      ]);
      expect(stored).toEqual([{ action: 'test.insert' }]);
    } finally {
      await su.end();
    }
  });

  it('ab_app cannot UPDATE, DELETE or TRUNCATE the audit log', async () => {
    await expect(
      app.query(`UPDATE audit_log SET action = 'x' WHERE id = $1`, [auditId]),
    ).rejects.toThrow(/permission denied/);
    await expect(app.query('DELETE FROM audit_log WHERE id = $1', [auditId])).rejects.toThrow(
      /permission denied/,
    );
    await expect(app.query('TRUNCATE audit_log')).rejects.toThrow(/permission denied/);
  });

  it('ab_platform cannot rewrite the audit log either', async () => {
    const platform = await connect(urls.platform);
    try {
      await expect(platform.query('DELETE FROM audit_log')).rejects.toThrow(/permission denied/);
    } finally {
      await platform.end();
    }
  });

  it('ab_app has no BYPASSRLS and cannot change the schema', async () => {
    const { rows } = await app.query(
      'SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user',
    );
    expect(rows).toEqual([{ rolbypassrls: false, rolsuper: false }]);
    await expect(app.query('CREATE TABLE sneaky (id int)')).rejects.toThrow(/permission denied/);
  });

  it('ab_app can read but not write release flag definitions and overrides', async () => {
    await expect(
      app.query(
        `INSERT INTO feature_flag (key, description, owner, expires_on, updated_at) VALUES ('x','x','x','2030-01-01', now())`,
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(app.query('DELETE FROM feature_flag_override')).rejects.toThrow(
      /permission denied/,
    );
    await expect(app.query('SELECT count(*) FROM feature_flag')).resolves.toBeDefined();
  });

  it('ab_app can use the outbox and idempotency tables', async () => {
    await app.query(
      `INSERT INTO outbox_event (id, type, payload) VALUES ($1, 'test.event', '{}')`,
      [newId()],
    );
    await app.query(
      `INSERT INTO idempotency_record (id, scope, key, request_hash, status, expires_at)
       VALUES ($1, 'test', 'k1', repeat('a', 64), 'IN_PROGRESS', now() + interval '1 day')`,
      [newId()],
    );
  });

  it('one override per (flag, environment, tenant), NULL meaning "every"', async () => {
    await migrator.query(
      `INSERT INTO feature_flag (key, description, owner, expires_on, updated_at) VALUES ('t-flag','d','PO','2030-01-01', now())`,
    );
    const insert = (env: string | null) =>
      migrator.query(
        `INSERT INTO feature_flag_override (id, flag_key, environment, tenant_id, enabled, updated_at) VALUES ($1, 't-flag', $2, NULL, true, now())`,
        [newId(), env],
      );
    await insert(null);
    await expect(insert(null)).rejects.toThrow(/duplicate key/);
    await insert('staging');
    await expect(insert('staging')).rejects.toThrow(/duplicate key/);
  });
});
