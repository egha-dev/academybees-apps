import { newId, type RoleKey } from '@academybee/contracts';

import type { PrismaClient } from '../generated/prisma/client.js';
import { ensureSystemRoles } from '../roles.js';
import { DEV_TENANTS } from './tenants.js';

/**
 * Local/CI demo people (IMPLEMENTATION_PLAN Phase 2): one user per role in demo-a, the teacher also
 * a member of demo-b, and a Super Admin. Fixed ids keep re-runs idempotent. Passwords are added by
 * `seedDevCredentials` (Phase 2 S2). Seeds never run outside local/ci (guard.ts).
 */
export type DevUser = {
  id: string;
  email: string;
  name: string;
  memberships: Array<{ slug: string; roles: RoleKey[] }>;
  platformRole?: 'SUPER_ADMIN';
};

export const DEV_USERS: readonly DevUser[] = [
  {
    id: '01a0fcde-79da-77c3-98c7-694de7df4a7a',
    email: 'owner@demo-a.test',
    name: 'Asha Owner',
    memberships: [{ slug: 'demo-a', roles: ['owner'] }],
  },
  {
    id: '01a0fcde-7a82-77e9-a77b-863d765d9ee8',
    email: 'admin@demo-a.test',
    name: 'Arjun Admin',
    memberships: [{ slug: 'demo-a', roles: ['admin'] }],
  },
  {
    id: '01a0fcde-7b21-71ed-8e9e-c472c65a408b',
    email: 'teacher@demo-a.test',
    name: 'Tara Teacher',
    // Works at two academies: signs in separately on each host (ADR-006).
    memberships: [
      { slug: 'demo-a', roles: ['teacher'] },
      { slug: 'demo-b', roles: ['teacher'] },
    ],
  },
  {
    id: '01a0fcde-7bbb-71df-95cf-a2425936f80a',
    email: 'accountant@demo-a.test',
    name: 'Anil Accountant',
    memberships: [{ slug: 'demo-a', roles: ['accountant'] }],
  },
  {
    id: '01a0fcde-7c60-7468-ba28-47475ca0f782',
    email: 'reception@demo-a.test',
    name: 'Rekha Reception',
    memberships: [{ slug: 'demo-a', roles: ['receptionist'] }],
  },
  {
    id: '01a0fcde-7db2-7363-a87c-c42f4ad6d590',
    email: 'parent@demo-a.test',
    name: 'Priya Parent',
    memberships: [{ slug: 'demo-a', roles: ['parent'] }],
  },
  {
    id: '01a0fcde-7e4c-7575-a710-ac14ae278265',
    email: 'student@demo-a.test',
    name: 'Sanjay Student',
    memberships: [{ slug: 'demo-a', roles: ['student'] }],
  },
  {
    id: '01a0fcde-7f21-73a9-870c-c68dcd1bd687',
    email: 'owner@demo-b.test',
    name: 'Bhavna Owner',
    memberships: [{ slug: 'demo-b', roles: ['owner'] }],
  },
  {
    id: '01a0fcde-7fed-718c-983a-438bd2191543',
    email: 'superadmin@academybees.test',
    name: 'Super Admin',
    memberships: [],
    platformRole: 'SUPER_ADMIN',
  },
];

/** System roles for every demo academy, then the demo users, memberships and platform staff. */
export async function seedDevUsers(db: PrismaClient): Promise<number> {
  const roleIds = new Map<string, Record<RoleKey, string>>();
  for (const t of DEV_TENANTS) {
    roleIds.set(
      t.slug,
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.tenant_id', ${t.id}, true)`;
        return ensureSystemRoles(tx, t.id, newId);
      }),
    );
  }

  for (const u of DEV_USERS) {
    // A user may be created only for the identifier being looked up (C-59).
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.lookup_identifier', ${u.email}, true)`;
      await tx.$queryRaw`SELECT set_config('app.user_id', ${u.id}, true)`;
      await tx.user.upsert({
        where: { id: u.id },
        create: { id: u.id, email: u.email, name: u.name, emailVerifiedAt: new Date() },
        update: { name: u.name },
      });
      if (u.platformRole)
        await tx.platformStaff.upsert({
          where: { userId: u.id },
          create: { userId: u.id, platformRole: u.platformRole },
          update: { platformRole: u.platformRole, status: 'ACTIVE' },
        });
    });

    for (const m of u.memberships) {
      const tenant = DEV_TENANTS.find((t) => t.slug === m.slug);
      const roles = roleIds.get(m.slug);
      if (!tenant || !roles) throw new Error(`Unknown demo academy ${m.slug}`);
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;
        const membership = await tx.membership.upsert({
          where: { tenantId_userId: { tenantId: tenant.id, userId: u.id } },
          create: { id: newId(), tenantId: tenant.id, userId: u.id, status: 'ACTIVE' },
          update: { status: 'ACTIVE' },
          select: { id: true },
        });
        await tx.membershipRole.createMany({
          data: m.roles.map((key) => ({
            tenantId: tenant.id,
            membershipId: membership.id,
            roleId: roles[key],
          })),
          skipDuplicates: true,
        });
      });
    }
  }
  return DEV_USERS.length;
}
