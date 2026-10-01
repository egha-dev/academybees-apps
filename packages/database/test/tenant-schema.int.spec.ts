import { newId } from '@academybee/contracts';
import { createTenantFixture, type TenantFixture } from '@academybee/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

const urls = inject('databaseUrls');

async function connect(url: string) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

/** Run statements in one transaction with the tenant context set (as the tenant-bound client will). */
async function inTenant<T>(client: pg.Client, tenantId: string, fn: () => Promise<T>): Promise<T> {
  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    const result = await fn();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

describe('tenant schema invariants (ARCHITECTURE §5.1)', () => {
  let tenant: TenantFixture;
  let migrator: pg.Client;
  let app: pg.Client;

  beforeAll(async () => {
    tenant = await createTenantFixture(urls.migrator);
    migrator = await connect(urls.migrator);
    app = await connect(urls.app);
  });

  afterAll(async () => {
    await migrator.end();
    await app.end();
  });

  it('allows exactly one default branch per tenant (C-07)', async () => {
    await expect(
      inTenant(migrator, tenant.id, () =>
        migrator.query(
          `INSERT INTO branch (id, tenant_id, name, is_default, updated_at) VALUES ($1, $2, 'Second', true, now())`,
          [newId(), tenant.id],
        ),
      ),
    ).rejects.toThrow(/branch_one_default/);
  });

  it('allows exactly one PRIMARY domain per tenant', async () => {
    await expect(
      inTenant(migrator, tenant.id, () =>
        migrator.query(
          `INSERT INTO tenant_domain (id, tenant_id, hostname, kind, role, updated_at)
           VALUES ($1, $2, $3, 'SUBDOMAIN', 'PRIMARY', now())`,
          [newId(), tenant.id, `${tenant.slug}-x`],
        ),
      ),
    ).rejects.toThrow(/tenant_domain_one_primary/);
  });

  it.each([
    ['upper-case label', 'Upper-Case', 'SUBDOMAIN'],
    ['subdomain with a dot', 'a.b', 'SUBDOMAIN'],
    ['custom host without a dot', 'example', 'CUSTOM'],
  ])('rejects a hostname that breaks the shape rule (C-52): %s', async (_, hostname, kind) => {
    await expect(
      inTenant(migrator, tenant.id, () =>
        migrator.query(
          `INSERT INTO tenant_domain (id, tenant_id, hostname, kind, role, updated_at)
           VALUES ($1, $2, $3, $4, 'ALIAS', now())`,
          [newId(), tenant.id, hostname, kind],
        ),
      ),
    ).rejects.toThrow(/tenant_domain_hostname_shape/);
  });

  it('ab_app cannot create tenants or change domains (platform-only, PRD v3.1 §B, §F)', async () => {
    await expect(
      inTenant(app, tenant.id, () =>
        app.query(
          `INSERT INTO tenant (id, slug, name, academy_type, updated_at) VALUES ($1, 'x-new', 'X', 'tuition', now())`,
          [newId()],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      inTenant(app, tenant.id, () =>
        app.query(`UPDATE tenant_domain SET hostname = 'hijack' WHERE tenant_id = $1`, [tenant.id]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('ab_app can update its own academy row under its context', async () => {
    const { rowCount } = await inTenant(app, tenant.id, () =>
      app.query(`UPDATE tenant SET name = 'Renamed' WHERE id = $1`, [tenant.id]),
    );
    expect(rowCount).toBe(1);
  });

  it.each([
    ['status', `status = 'ACTIVE'`],
    ['slug', `slug = 'taken-over'`],
    ['id', `id = gen_random_uuid()`],
  ])('ab_app cannot change the academy %s (platform-only, review M2)', async (_, set) => {
    await expect(
      inTenant(app, tenant.id, () =>
        app.query(`UPDATE tenant SET ${set} WHERE id = $1`, [tenant.id]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it.each(['../console', 'Upper', 'ab', 'a--b', 'xn--abc', '-abc', 'with space'])(
    'the database refuses the slug %j',
    async (slug) => {
      const su = await connect(urls.superuser);
      try {
        await expect(
          su.query(`UPDATE tenant SET slug = $1 WHERE id = $2`, [slug, tenant.id]),
        ).rejects.toThrow(/tenant_slug_shape/);
      } finally {
        await su.end();
      }
    },
  );
});
