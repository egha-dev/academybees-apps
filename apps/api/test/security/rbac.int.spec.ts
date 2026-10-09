import { ROLE_TEMPLATES } from '@academybee/contracts';
import {
  addMemberFixture,
  createTenantFixture,
  FIXTURE_PASSWORD,
  type Grant,
  type MemberFixture,
  type TenantFixture,
} from '@academybee/testing';
import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { MembershipService } from '../../src/core/auth/membership.service.js';
import { createTestApp } from '../support/test-app.js';

/** Capabilities and scopes (ADR-008, ARCHITECTURE §7): privilege escalation and IDOR. */
const urls = inject('databaseUrls');

const templateGrants = (key: keyof typeof ROLE_TEMPLATES): Grant[] =>
  Object.entries(ROLE_TEMPLATES[key].grants).map(([capability, scope]) => ({
    capability,
    scope: scope,
  }));

describe('roles, capabilities and scopes', () => {
  let app: INestApplication;
  let a: TenantFixture;
  let teacher: MemberFixture;
  let selfOnly: MemberFixture;
  let branch1: MemberFixture;
  let branch2: MemberFixture;
  let su: pg.Client;
  const host = () => `${a.slug}.localhost`;

  const signIn = async (email: string) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', host())
      .send({ identifier: email, password: FIXTURE_PASSWORD });
    expect(res.status, `sign-in ${email}`).toBe(200);
    return ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .map((c) => c.split(';')[0]!)
      .join('; ');
  };
  const get = async (path: string, email: string) => {
    // Sign in first: supertest binds its server when a request is created.
    const cookie = await signIn(email);
    return request(app.getHttpServer()).get(path).set('Host', host()).set('Cookie', cookie);
  };

  beforeAll(async () => {
    a = await createTenantFixture(urls.migrator, { name: 'RBAC Academy' });
    const [b1, b2] = [
      '01a0fd00-0000-7000-8000-0000000000b1',
      '01a0fd00-0000-7000-8000-0000000000b2',
    ];
    teacher = await addMemberFixture(urls.migrator, a.id, {
      email: `teacher-${a.slug}@example.test`,
      roleKey: 'teacher',
      grants: templateGrants('teacher'),
    });
    selfOnly = await addMemberFixture(urls.migrator, a.id, {
      email: `self-${a.slug}@example.test`,
      roleKey: 'selfonly',
      grants: [{ capability: 'team.read', scope: 'SELF' }],
    });
    branch1 = await addMemberFixture(urls.migrator, a.id, {
      email: `branch1-${a.slug}@example.test`,
      roleKey: 'branchadmin',
      grants: [{ capability: 'team.read', scope: 'BRANCH' }],
      branchIds: [b1],
    });
    branch2 = await addMemberFixture(urls.migrator, a.id, {
      email: `branch2-${a.slug}@example.test`,
      roleKey: 'branchadmin',
      grants: [{ capability: 'team.read', scope: 'BRANCH' }],
      branchIds: [b2],
    });
    app = await createTestApp();
    su = new pg.Client({ connectionString: urls.superuser });
    await su.connect();
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

  it('a teacher cannot call owner-only endpoints (privilege escalation → 403)', async () => {
    const res = await get('/api/v1/test/secure/settings', teacher.email);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    const me = await get('/api/v1/auth/me', teacher.email);
    expect(me.body.academy.capabilities['attendance.mark']).toBe('ASSIGNED');
    expect(me.body.academy.capabilities['academy.settings.manage']).toBeUndefined();
  });

  it('SELF scope: the list shows only yourself; another member is not found (IDOR → 404)', async () => {
    expect((await get('/api/v1/test/secure/members', selfOnly.email)).body.members).toEqual([
      selfOnly.userId,
    ]);
    const other = await get(`/api/v1/test/secure/members/${teacher.membershipId}`, selfOnly.email);
    expect(other.status).toBe(404);
    expect(other.body.error.code).toBe('NOT_FOUND');
    const own = await get(`/api/v1/test/secure/members/${selfOnly.membershipId}`, selfOnly.email);
    expect(own.body).toEqual({ userId: selfOnly.userId });
  });

  it('BRANCH scope: members of another branch are invisible in lists and by id', async () => {
    const list = (await get('/api/v1/test/secure/members', branch1.email)).body.members as string[];
    expect(list).toContain(branch1.userId);
    expect(list).not.toContain(branch2.userId);
    // Unrestricted members (no branches) belong to every branch.
    expect(list).toContain(a.user.id);
    expect(
      (await get(`/api/v1/test/secure/members/${branch2.membershipId}`, branch1.email)).status,
    ).toBe(404);
  });

  it('an unknown or malformed id is a plain 404, never a 500', async () => {
    for (const id of ['01a0fd00-0000-7000-8000-00000000dead', 'not-a-uuid']) {
      const res = await get(`/api/v1/test/secure/members/${id}`, a.user.email);
      expect(res.status, id).toBe(404);
    }
  });

  it('a role change applies on the next request', async () => {
    const cookie = await signIn(selfOnly.email);
    const call = () =>
      request(app.getHttpServer())
        .get('/api/v1/test/secure/settings')
        .set('Host', host())
        .set('Cookie', cookie);
    expect((await call()).status).toBe(403);
    await su.query(
      `INSERT INTO role_permission (tenant_id, role_id, capability, scope)
       SELECT r.tenant_id, r.id, 'academy.settings.manage', 'TENANT'
         FROM role r JOIN membership_role mr ON mr.role_id = r.id WHERE mr.membership_id = $1`,
      [selfOnly.membershipId],
    );
    await su.query(
      `UPDATE membership SET permissions_version = permissions_version + 1 WHERE id = $1`,
      [selfOnly.membershipId],
    );
    await app.get(MembershipService).invalidate(a.id, selfOnly.userId);
    expect((await call()).status).toBe(200);
  });
});
