import { AsyncLocalStorage } from 'node:async_hooks';

import { newId } from '@academybee/contracts';
import { createTenantFixture, type TenantFixture } from '@academybee/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import {
  createTenantBoundClient,
  TENANT_OWNED_MODELS,
  type TenantBoundClient,
  TenantContextMissingError,
  TenantMismatchError,
} from '../src/tenant.js';

/**
 * Tenant isolation against the real database policies (ADR-005, ADR-022). The matrix is generated
 * from the Prisma models: every model with a tenantId column is checked, so a new tenant table is
 * covered the day it is added (and the suite fails until it has fixture rows for both tenants).
 */
const urls = inject('databaseUrls');

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const tableOf = (model: string) => model.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

type Delegate = {
  findMany: (args?: unknown) => Promise<Array<{ tenantId: string }>>;
  count: (args?: unknown) => Promise<number>;
};

describe('tenant isolation (ADR-005)', () => {
  let a: TenantFixture;
  let b: TenantFixture;
  let db: TenantBoundClient;
  // Same mechanism as the API's CLS: the context follows the async call chain into the driver.
  const context = new AsyncLocalStorage<string | undefined>();
  let migrator: pg.Client;
  let app: pg.Client;

  // Prisma promises are lazy: they run when awaited, so await inside the context (as request
  // handlers do inside their CLS scope).
  const asTenant = <T>(tenantId: string | undefined, fn: () => PromiseLike<T>): Promise<T> =>
    context.run(tenantId, async () => await fn());

  beforeAll(async () => {
    [a, b] = await Promise.all([
      createTenantFixture(urls.migrator),
      createTenantFixture(urls.migrator),
    ]);
    // One connection, so every test also proves a reused pooled connection carries no context.
    db = createTenantBoundClient(urls.app, () => context.getStore(), { maxConnections: 1 });
    migrator = new pg.Client({ connectionString: urls.migrator });
    app = new pg.Client({ connectionString: urls.app });
    await Promise.all([migrator.connect(), app.connect()]);
  });

  afterAll(async () => {
    await db.$disconnect();
    await Promise.all([migrator.end(), app.end()]);
  });

  it('knows the tenant-owned models', () => {
    expect(TENANT_OWNED_MODELS).toEqual(
      expect.arrayContaining(['TenantDomain', 'TenantBranding', 'TenantSettings', 'Branch']),
    );
  });

  describe.each(TENANT_OWNED_MODELS)('%s', (model) => {
    const delegate = () => (db as unknown as Record<string, Delegate>)[lowerFirst(model)]!;
    const table = tableOf(model);

    it('has fixture rows for both tenants (add them to createTenantFixture)', async () => {
      const { rows } = await new Promise<pg.QueryResult<{ n: number }>>((resolve, reject) => {
        const su = new pg.Client({ connectionString: urls.superuser });
        su.connect()
          .then(() =>
            su.query<{ n: number }>(
              `SELECT count(DISTINCT tenant_id)::int AS n FROM ${table} WHERE tenant_id IN ($1, $2)`,
              [a.id, b.id],
            ),
          )
          .then(resolve, reject)
          .finally(() => void su.end());
      });
      expect(rows[0]?.n).toBe(2);
    });

    it('with context A, findMany returns only A rows', async () => {
      const rows = await asTenant(a.id, () => delegate().findMany());
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.tenantId === a.id)).toBe(true);
    });

    it('an explicit filter on tenant B is refused by the client', async () => {
      await expect(
        asTenant(a.id, () => delegate().findMany({ where: { tenantId: b.id } })),
      ).rejects.toBeInstanceOf(TenantMismatchError);
    });

    it('without a context, the client refuses to run (fail closed)', async () => {
      await expect(delegate().findMany()).rejects.toBeInstanceOf(TenantContextMissingError);
    });

    it('raw SQL as ab_app without app.tenant_id returns zero rows', async () => {
      const { rows } = await app.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
      expect(rows[0]?.n).toBe(0);
    });

    it('raw SQL with context A sees only A rows', async () => {
      await app.query('BEGIN');
      try {
        await app.query(`SELECT set_config('app.tenant_id', $1, true)`, [a.id]);
        const { rows } = await app.query<{ tenant_id: string }>(
          `SELECT DISTINCT tenant_id FROM ${table}`,
        );
        expect(rows).toEqual([{ tenant_id: a.id }]);
      } finally {
        await app.query('ROLLBACK');
      }
    });

    it('under context A, updating or deleting B rows affects nothing (even for the table owner)', async () => {
      await migrator.query('BEGIN');
      try {
        await migrator.query(`SELECT set_config('app.tenant_id', $1, true)`, [a.id]);
        const updated = await migrator.query(
          `UPDATE ${table} SET tenant_id = tenant_id WHERE tenant_id = $1`,
          [b.id],
        );
        const deleted = await migrator.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [b.id]);
        expect(updated.rowCount).toBe(0);
        expect(deleted.rowCount).toBe(0);
      } finally {
        await migrator.query('ROLLBACK');
      }
    });

    it('under context A, moving an A row to tenant B is rejected by WITH CHECK', async () => {
      await migrator.query('BEGIN');
      try {
        await migrator.query(`SELECT set_config('app.tenant_id', $1, true)`, [a.id]);
        await expect(
          migrator.query(`UPDATE ${table} SET tenant_id = $1 WHERE tenant_id = $2`, [b.id, a.id]),
        ).rejects.toThrow(/row-level security/);
      } finally {
        await migrator.query('ROLLBACK');
      }
    });
  });

  describe('writes through the client', () => {
    it('injects the current tenant into created rows', async () => {
      const branch = await asTenant(a.id, () =>
        db.branch.create({ data: { id: newId(), name: 'Annex' } as never }),
      );
      expect(branch.tenantId).toBe(a.id);
    });

    it('refuses to create a row for another tenant', async () => {
      await expect(
        asTenant(a.id, () =>
          db.branch.create({ data: { id: newId(), tenantId: b.id, name: 'Sneaky' } }),
        ),
      ).rejects.toBeInstanceOf(TenantMismatchError);
    });

    it('a write for tenant B with context A is rejected by WITH CHECK (raw SQL)', async () => {
      await app.query('BEGIN');
      try {
        await app.query(`SELECT set_config('app.tenant_id', $1, true)`, [a.id]);
        await expect(
          app.query(
            `INSERT INTO branch (id, tenant_id, name, updated_at) VALUES ($1, $2, 'x', now())`,
            [newId(), b.id],
          ),
        ).rejects.toThrow(/row-level security/);
      } finally {
        await app.query('ROLLBACK');
      }
    });

    it('cannot read a B record by id under A', async () => {
      const row = await asTenant(a.id, () => db.branch.findUnique({ where: { id: b.branchId } }));
      expect(row).toBeNull();
    });

    it('updateMany by id of a B record changes nothing under A', async () => {
      const { count } = await asTenant(a.id, () =>
        db.branch.updateMany({ where: { id: b.branchId }, data: { name: 'Hijacked' } }),
      );
      expect(count).toBe(0);
    });
  });

  describe('the tenant row', () => {
    it('context A sees only academy A', async () => {
      const tenants = await asTenant(a.id, () => db.tenant.findMany());
      expect(tenants.map((t) => t.id)).toEqual([a.id]);
    });

    it('cannot address academy B by id', async () => {
      await expect(
        asTenant(a.id, () => db.tenant.findUnique({ where: { id: b.id } })),
      ).rejects.toBeInstanceOf(TenantMismatchError);
    });
  });

  describe('transactions and raw queries', () => {
    it('an interactive transaction runs entirely under the tenant context', async () => {
      const result = await asTenant(a.id, () =>
        db.$transaction(async (tx) => {
          const [setting] = await tx.$queryRaw<
            Array<{ t: string }>
          >`SELECT current_setting('app.tenant_id', true) AS t`;
          const branches = await tx.branch.findMany();
          return { setting: setting?.t, tenants: new Set(branches.map((r) => r.tenantId)) };
        }),
      );
      expect(result.setting).toBe(a.id);
      expect([...result.tenants]).toEqual([a.id]);
    });

    it('scopes arguments inside a transaction too', async () => {
      await expect(
        asTenant(a.id, () =>
          db.$transaction((tx) => tx.branch.findMany({ where: { tenantId: b.id } })),
        ),
      ).rejects.toBeInstanceOf(TenantMismatchError);
    });

    it('a batch transaction runs under the tenant context', async () => {
      const [branches, setting] = await asTenant(a.id, () =>
        db.$transaction([
          db.branch.findMany(),
          db.$queryRaw<Array<{ t: string }>>`SELECT current_setting('app.tenant_id', true) AS t`,
        ]),
      );
      expect(new Set(branches.map((r) => r.tenantId))).toEqual(new Set([a.id]));
      expect(setting).toEqual([{ t: a.id }]);
    });

    it('a failed transaction rolls back and leaves the connection clean', async () => {
      await expect(
        asTenant(a.id, () =>
          db.$transaction(async (tx) => {
            await tx.branch.create({ data: { id: newId(), name: 'Rolled back' } as never });
            throw new Error('boom');
          }),
        ),
      ).rejects.toThrow('boom');
      const rows = await asTenant(a.id, () =>
        db.branch.findMany({ where: { name: 'Rolled back' } }),
      );
      expect(rows).toEqual([]);
      const leaked = await db.$queryRaw<Array<{ t: string | null }>>`
        SELECT NULLIF(current_setting('app.tenant_id', true), '') AS t`;
      expect(leaked).toEqual([{ t: null }]);
    });

    it('concurrent requests for two tenants in the same tick each see their own rows', async () => {
      const [ra, rb] = await Promise.all([
        asTenant(a.id, () => db.branch.findUnique({ where: { id: a.branchId } })),
        asTenant(b.id, () => db.branch.findUnique({ where: { id: b.branchId } })),
      ]);
      expect(ra?.tenantId).toBe(a.id);
      expect(rb?.tenantId).toBe(b.id);
      const lists = await Promise.all(
        [a.id, b.id, a.id, b.id].map((t) => asTenant(t, () => db.branch.findMany())),
      );
      lists.forEach((rows, i) =>
        expect(new Set(rows.map((r) => r.tenantId))).toEqual(new Set([i % 2 ? b.id : a.id])),
      );
    });

    it('raw queries through the client run under the tenant context', async () => {
      const rows = await asTenant(
        a.id,
        () => db.$queryRaw<Array<{ tenant_id: string }>>`SELECT DISTINCT tenant_id FROM branch`,
      );
      expect(rows).toEqual([{ tenant_id: a.id }]);
    });

    it('a raw query without context sees no tenant rows', async () => {
      const rows = await db.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM branch`;
      expect(rows).toEqual([{ n: 0 }]);
    });
  });

  describe('platform rows in core tables (C-53)', () => {
    const outbox = (id: string) => ({ id, type: 'test.event', payload: { ok: true } });

    it('without a context, NULL-tenant rows are writable and readable; tenant rows are not', async () => {
      const id = newId();
      await db.outboxEvent.create({ data: outbox(id) });
      const tenantRowId = newId();
      await asTenant(a.id, () => db.outboxEvent.create({ data: outbox(tenantRowId) }));
      const visible = await db.outboxEvent.findMany({ where: { id: { in: [id, tenantRowId] } } });
      expect(visible.map((r) => r.id)).toEqual([id]);
    });

    it('with context A, NULL-tenant and B rows are invisible', async () => {
      const platformId = newId();
      await db.outboxEvent.create({ data: outbox(platformId) });
      const bId = newId();
      await asTenant(b.id, () => db.outboxEvent.create({ data: outbox(bId) }));
      const seen = await asTenant(a.id, () =>
        db.outboxEvent.findMany({ where: { id: { in: [platformId, bId] } } }),
      );
      expect(seen).toEqual([]);
    });

    it('with context A, a platform row cannot be written', async () => {
      await expect(
        asTenant(a.id, () =>
          db.outboxEvent.create({ data: { ...outbox(newId()), tenantId: null } }),
        ),
      ).rejects.toBeInstanceOf(TenantMismatchError);
    });
  });

  describe('audit log (review L8)', () => {
    const audit = (id: string) => ({ id, actorType: 'SYSTEM' as const, action: 'test.audit' });

    it('platform audit rows are insert-only for the app role, even without a context', async () => {
      const id = newId();
      await db.auditLog.createMany({ data: [audit(id)] });
      expect(await db.auditLog.findMany({ where: { id } })).toEqual([]);
      const su = new pg.Client({ connectionString: urls.superuser });
      await su.connect();
      try {
        const { rows } = await su.query('SELECT tenant_id FROM audit_log WHERE id = $1', [id]);
        expect(rows).toEqual([{ tenant_id: null }]);
      } finally {
        await su.end();
      }
    });

    it("an academy reads its own audit rows and never another's", async () => {
      const mine = newId();
      const theirs = newId();
      await asTenant(a.id, () => db.auditLog.createMany({ data: [audit(mine)] }));
      await asTenant(b.id, () => db.auditLog.createMany({ data: [audit(theirs)] }));
      const seen = await asTenant(a.id, () =>
        db.auditLog.findMany({ where: { id: { in: [mine, theirs] } } }),
      );
      expect(seen.map((r) => r.id)).toEqual([mine]);
    });
  });

  describe('host lookup (C-51)', () => {
    it('resolves exactly the requested hostname', async () => {
      const row = await db.$lookupTenantDomain(a.slug);
      expect(row).toMatchObject({
        tenantId: a.id,
        role: 'PRIMARY',
        tenant: { id: a.id, slug: a.slug, status: 'ACTIVE' },
      });
    });

    it('returns null for an unknown hostname', async () => {
      expect(await db.$lookupTenantDomain('no-such-academy')).toBeNull();
    });

    it('is refused inside a tenant context', async () => {
      await expect(asTenant(a.id, () => db.$lookupTenantDomain(b.slug))).rejects.toThrow(
        /before a tenant context/,
      );
    });

    it('the lookup GUC exposes only that hostname and its tenant', async () => {
      await app.query('BEGIN');
      try {
        await app.query(`SELECT set_config('app.lookup_host', $1, true)`, [a.slug]);
        const domains = await app.query(`SELECT tenant_id FROM tenant_domain`);
        const tenants = await app.query(`SELECT id FROM tenant`);
        const branding = await app.query(`SELECT tenant_id FROM tenant_branding`);
        expect(domains.rows).toEqual([{ tenant_id: a.id }]);
        expect(tenants.rows).toEqual([{ id: a.id }]);
        expect(branding.rows).toEqual([]);
      } finally {
        await app.query('ROLLBACK');
      }
    });
  });
});
