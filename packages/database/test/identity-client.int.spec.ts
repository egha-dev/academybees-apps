import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';

import { newId } from '@academybee/contracts';
import { createTenantFixture, type TenantFixture } from '@academybee/testing';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { bindUser, createTenantBoundClient, type TenantBoundClient } from '../src/tenant.js';

/** The tenant-bound client with a user context and identity lookups (C-59). */
const urls = inject('databaseUrls');

describe('tenant-bound client — user context (C-59)', () => {
  let a: TenantFixture;
  let b: TenantFixture;
  let db: TenantBoundClient;
  const ctx = new AsyncLocalStorage<{ tenantId?: string; userId?: string }>();
  const as = <T>(c: { tenantId?: string; userId?: string }, fn: () => PromiseLike<T>) =>
    ctx.run(c, async () => await fn());

  beforeAll(async () => {
    [a, b] = await Promise.all([
      createTenantFixture(urls.migrator),
      createTenantFixture(urls.migrator),
    ]);
    db = createTenantBoundClient(urls.app, () => ctx.getStore()?.tenantId, {
      getUserId: () => ctx.getStore()?.userId,
      maxConnections: 1,
    });
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it('a user context sees exactly its own user row', async () => {
    const users = await as({ userId: a.user.id }, () => db.user.findMany({ select: { id: true } }));
    expect(users).toEqual([{ id: a.user.id }]);
  });

  it('academy and user context apply together in one statement', async () => {
    const rows = await as(
      { tenantId: a.id, userId: a.user.id },
      () =>
        db.$queryRaw<Array<{ t: string; u: string }>>`
        SELECT current_setting('app.tenant_id', true) AS t, current_setting('app.user_id', true) AS u`,
    );
    expect(rows).toEqual([{ t: a.id, u: a.user.id }]);
  });

  it('a lookup finds one user by identifier; bindUser then opens their own rows', async () => {
    const result = await db.$withLookup({ identifier: a.user.email }, async (tx) => {
      const user = await tx.user.findFirst({
        where: { email: a.user.email },
        select: { id: true },
      });
      if (!user) return null;
      await bindUser(tx, user.id);
      await tx.userCredential.upsert({
        where: { userId: user.id },
        create: { userId: user.id, passwordHash: 'x' },
        update: {},
      });
      return { user, credential: await tx.userCredential.findFirst({ select: { userId: true } }) };
    });
    expect(result).toEqual({ user: { id: a.user.id }, credential: { userId: a.user.id } });
  });

  it('a lookup for one identifier cannot see another user', async () => {
    const seen = await db.$withLookup({ identifier: a.user.email }, (tx) =>
      tx.user.findMany({ where: { id: b.user.id } }),
    );
    expect(seen).toEqual([]);
  });

  it('a token lookup finds one session; without it the session is invisible', async () => {
    const token = newId();
    const hash = createHash('sha256').update(token).digest('hex');
    await as({ userId: b.user.id }, () =>
      db.authSession.create({
        data: {
          id: newId(),
          userId: b.user.id,
          tenantId: b.id,
          audience: 'TENANT',
          familyId: newId(),
          refreshTokenHash: hash,
          expiresAt: new Date(Date.now() + 60_000),
        },
      }),
    );
    expect(await db.authSession.findMany({ where: { refreshTokenHash: hash } })).toEqual([]);
    const found = await db.$withLookup({ token: hash }, (tx) =>
      tx.authSession.findFirst({ where: { refreshTokenHash: hash }, select: { userId: true } }),
    );
    expect(found).toEqual({ userId: b.user.id });
  });

  it('a pooled connection carries no user after a user-scoped statement', async () => {
    await as({ userId: a.user.id }, () => db.user.findMany());
    const rows = await db.$queryRaw<Array<{ u: string | null }>>`
      SELECT NULLIF(current_setting('app.user_id', true), '') AS u`;
    expect(rows).toEqual([{ u: null }]);
  });
});
