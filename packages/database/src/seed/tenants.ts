import { newId, startTrialSubscription } from '@academybee/contracts';

import type { PrismaClient, TenantStatus } from '../generated/prisma/client.js';

/** Local/CI demo academies (IMPLEMENTATION_PLAN Phase 1, C-54). Fixed ids keep re-runs idempotent. */
export type DevTenant = {
  id: string;
  branchId: string;
  slug: string;
  name: string;
  academyType: string;
  status: TenantStatus;
  primaryColor: string;
  /** Extra subdomain labels that 301 to the primary (old slugs). */
  redirects?: readonly string[];
};

export const DEV_TENANTS: readonly DevTenant[] = [
  {
    id: '01a0f76f-f6b7-7509-a8c2-25059adb97fb',
    branchId: '01a0f76f-f8f6-70da-b78c-1b155e361f95',
    slug: 'demo-a',
    name: 'Demo A Academy',
    academyType: 'tuition',
    status: 'ACTIVE',
    primaryColor: '#1F6F5C',
    redirects: ['old-demo-a'],
  },
  {
    id: '01a0f76f-f745-76ee-8122-37ac4c53af4c',
    branchId: '01a0f76f-f980-7649-8cc5-37b14a70a4e7',
    slug: 'demo-b',
    name: 'Demo B Dance Studio',
    academyType: 'dance',
    status: 'ACTIVE',
    primaryColor: '#9C3D54',
  },
  {
    id: '01a0f76f-f7d6-7596-9d86-ad9df7b72450',
    branchId: '01a0f76f-fa0f-7725-ae33-2652a9b2ea96',
    slug: 'paused',
    name: 'Paused Karate Club',
    academyType: 'karate',
    status: 'SUSPENDED',
    primaryColor: '#2F4E8C',
  },
  {
    id: '01a0f76f-f862-774a-8a43-f2f8959ae247',
    branchId: '01a0f76f-fa90-7068-837e-8ce1403e3d78',
    slug: 'setup-demo',
    name: 'Setup Music School',
    academyType: 'music',
    status: 'SETUP',
    primaryColor: '#7A4B12',
  },
  {
    id: '01a0f76f-fb16-761b-bbf0-ef029f48ee83',
    branchId: '01a0f76f-fba0-71ad-87c3-bbc6df0e422b',
    slug: 'closed-demo',
    name: 'Closed Sports Academy',
    academyType: 'sports',
    status: 'ARCHIVED',
    primaryColor: '#3D5A3A',
  },
];

/**
 * Upsert the demo academies with a default branch, branding, settings and a Trial subscription. Runs as the schema
 * owner, which is still subject to FORCE RLS, so each tenant is written inside a transaction that
 * sets `app.tenant_id` to that tenant (ARCHITECTURE §8.2).
 */
export async function seedDevTenants(db: PrismaClient): Promise<number> {
  for (const t of DEV_TENANTS) {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.tenant_id', ${t.id}, true)`;
      const tenant = {
        slug: t.slug,
        name: t.name,
        academyType: t.academyType,
        status: t.status,
      };
      await tx.tenant.upsert({
        where: { id: t.id },
        create: { id: t.id, ...tenant },
        update: tenant,
      });

      const domains = [
        { hostname: t.slug, role: 'PRIMARY' as const },
        ...(t.redirects ?? []).map((hostname) => ({ hostname, role: 'REDIRECT' as const })),
      ];
      for (const d of domains) {
        await tx.tenantDomain.upsert({
          where: { hostname: d.hostname },
          create: {
            id: newId(),
            tenantId: t.id,
            hostname: d.hostname,
            kind: 'SUBDOMAIN',
            role: d.role,
            verification: 'VERIFIED',
            verifiedAt: new Date(),
          },
          update: { role: d.role },
        });
      }

      const branding = { displayName: t.name, primaryColor: t.primaryColor };
      await tx.tenantBranding.upsert({
        where: { tenantId: t.id },
        create: { tenantId: t.id, ...branding },
        update: branding,
      });
      await tx.tenantSettings.upsert({
        where: { tenantId: t.id },
        create: { tenantId: t.id },
        update: {},
      });
      await tx.branch.upsert({
        where: { id: t.branchId },
        create: { id: t.branchId, tenantId: t.id, name: 'Main branch', isDefault: true },
        update: {},
      });
      // Every academy has a subscription from provisioning (C-89): demo academies are on Trial.
      const trial = startTrialSubscription('trial', new Date());
      await tx.subscription.upsert({
        where: { tenantId: t.id },
        create: { tenantId: t.id, ...trial },
        update: {},
      });
    });
  }
  return DEV_TENANTS.length;
}
