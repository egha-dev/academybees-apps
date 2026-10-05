// Staging bootstrap (S7b, C-78): the two gate academies, one user per role, and the first console
// admin, all on addresses the PO controls. Run by the "Staging bootstrap" workflow (PO only).
//
// - Users get NO password. Each receives a one-time set-password link (single use, 72 h, stored
//   only as a SHA-256 hash) by email: outbox → worker → Resend, with the token sealed (C-62). The
//   link is never printed or returned, so it can't reach any log.
// - Idempotent: existing academies, users and memberships are kept. Users who already chose a
//   password are skipped; `--resend` issues fresh links to those who haven't.
// - Platform code: the ab_platform client (ADR-005); every action writes a platform audit row.
import { parseArgs } from 'node:util';

import { encryptSecret, generateToken, hashToken, loadMasterKeys } from '@academybee/auth';
import { EMAIL_OUTBOX_TYPE, EmailRequestSchema, newId, type RoleKey } from '@academybee/contracts';
import { ensureSystemRoles, type PrismaClient } from '@academybee/database';
import { createPlatformClient } from '@academybee/database/platform';
import { z } from 'zod';

import { createAdmin } from './create-admin.js';

const LINK_TTL_MS = 72 * 3600 * 1000;

export type StagingAcademy = {
  slug: string;
  name: string;
  academyType: string;
  primaryColor: string;
};

export type StagingUser = {
  email: string;
  name: string;
  memberships: Array<{ slug: string; roles: RoleKey[] }>;
};

/** The gate academies (IMPLEMENTATION_PLAN §2) — same names and looks as the local demo seed. */
export const STAGING_ACADEMIES: readonly StagingAcademy[] = [
  { slug: 'demo-a', name: 'Demo A Academy', academyType: 'tuition', primaryColor: '#1F6F5C' },
  { slug: 'demo-b', name: 'Demo B Dance Studio', academyType: 'dance', primaryColor: '#9C3D54' },
];

const ROLE_LABELS: Record<Exclude<RoleKey, 'teacher'>, [string, string]> = {
  owner: ['owner', 'Owner'],
  admin: ['admin', 'Admin'],
  accountant: ['accountant', 'Accountant'],
  receptionist: ['reception', 'Receptionist'],
  parent: ['parent', 'Parent'],
  student: ['student', 'Student'],
};

/**
 * One user per role per academy on the PO's inbox via Cloudflare subaddressing
 * (`hello+a-owner@academybees.com` → hello@), plus one teacher who teaches in both academies.
 */
export function stagingUsers(inbox = 'hello@academybees.com'): StagingUser[] {
  const [local, domain] = inbox.split('@') as [string, string];
  const at = (tag: string) => `${local}+${tag}@${domain}`;
  const users: StagingUser[] = [];
  for (const [letter, slug, label] of [
    ['a', 'demo-a', 'A'],
    ['b', 'demo-b', 'B'],
  ] as const) {
    for (const [role, [tag, title]] of Object.entries(ROLE_LABELS) as Array<
      [RoleKey, [string, string]]
    >) {
      users.push({
        email: at(`${letter}-${tag}`),
        name: `${label} ${title}`,
        memberships: [{ slug, roles: [role] }],
      });
    }
  }
  users.push({
    email: at('teacher'),
    name: 'Staging Teacher',
    memberships: [
      { slug: 'demo-a', roles: ['teacher'] },
      { slug: 'demo-b', roles: ['teacher'] },
    ],
  });
  return users;
}

const Env = z.object({
  APP_ENV: z.enum(['local', 'ci', 'staging', 'production']),
  PLATFORM_DATABASE_URL: z.string().min(1),
  SECRETS_MASTER_KEY: z.string().min(1),
  PLATFORM_ROOT_DOMAIN: z.string().optional(),
});

export type BootstrapOutcome = {
  academies: Array<{ slug: string; created: boolean }>;
  users: Array<{ email: string; status: 'link-emailed' | 'already-set-up' | 'link-pending' }>;
  console: { email: string; status: 'link-emailed' | 'already-set-up' | 'link-pending' };
};

/**
 * Create (or complete) the staging academies and users. Refuses any environment except staging,
 * unless the caller explicitly allows one (integration tests use `ci`).
 */
export async function bootstrapStaging(
  options: { resend?: boolean; inbox?: string; allowEnvs?: readonly string[] } = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<BootstrapOutcome> {
  const cfg = Env.parse(env);
  const allowed = options.allowEnvs ?? ['staging'];
  if (!allowed.includes(cfg.APP_ENV))
    throw new Error(`The staging bootstrap runs only with APP_ENV=${allowed.join('|')}`);
  const keys = loadMasterKeys(cfg.SECRETS_MASTER_KEY);
  const db = createPlatformClient(cfg.PLATFORM_DATABASE_URL, { maxConnections: 2 });
  try {
    const academies: BootstrapOutcome['academies'] = [];
    const roleIds = new Map<string, { tenantId: string; roles: Record<RoleKey, string> }>();
    for (const a of STAGING_ACADEMIES) {
      const result = await ensureAcademy(db, a);
      academies.push({ slug: a.slug, created: result.created });
      roleIds.set(a.slug, result);
    }

    const users: BootstrapOutcome['users'] = [];
    for (const u of stagingUsers(options.inbox)) {
      users.push({
        email: u.email,
        status: await ensureUser(db, u, roleIds, { resend: options.resend ?? false, keys }),
      });
    }

    const consoleEmail = `${(options.inbox ?? 'hello@academybees.com').replace('@', '+console@')}`;
    const consoleStatus = await ensureConsoleAdmin(db, consoleEmail, options.resend ?? false, env);
    return { academies, users, console: { email: consoleEmail, status: consoleStatus } };
  } finally {
    await db.$disconnect();
  }
}

async function ensureAcademy(
  db: PrismaClient,
  a: StagingAcademy,
): Promise<{ created: boolean; tenantId: string; roles: Record<RoleKey, string> }> {
  return db.$transaction(async (tx) => {
    const existing = await tx.tenant.findUnique({ where: { slug: a.slug }, select: { id: true } });
    const tenantId = existing?.id ?? newId();
    if (!existing) {
      await tx.tenant.create({
        data: {
          id: tenantId,
          slug: a.slug,
          name: a.name,
          academyType: a.academyType,
          status: 'ACTIVE',
        },
      });
      await tx.tenantDomain.create({
        data: {
          id: newId(),
          tenantId,
          hostname: a.slug,
          kind: 'SUBDOMAIN',
          role: 'PRIMARY',
          verification: 'VERIFIED',
          verifiedAt: new Date(),
        },
      });
      await tx.tenantBranding.create({
        data: { tenantId, displayName: a.name, primaryColor: a.primaryColor },
      });
      await tx.tenantSettings.create({ data: { tenantId } });
      await tx.branch.create({
        data: { id: newId(), tenantId, name: 'Main branch', isDefault: true },
      });
      await audit(tx, 'platform.staging_academy_created', 'Tenant', tenantId, { slug: a.slug });
    }
    const roles = await ensureSystemRoles(tx, tenantId, newId);
    return { created: !existing, tenantId, roles };
  });
}

async function ensureUser(
  db: PrismaClient,
  u: StagingUser,
  academies: Map<string, { tenantId: string; roles: Record<RoleKey, string> }>,
  opts: { resend: boolean; keys: ReturnType<typeof loadMasterKeys> },
): Promise<'link-emailed' | 'already-set-up' | 'link-pending'> {
  const first = u.memberships[0];
  if (!first) throw new Error(`${u.email} has no academy`);
  return db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { email: u.email },
      select: { id: true, credential: { select: { userId: true } } },
    });
    const userId = existing?.id ?? newId();
    if (!existing) await tx.user.create({ data: { id: userId, email: u.email, name: u.name } });

    for (const m of u.memberships) {
      const academy = academies.get(m.slug);
      if (!academy) throw new Error(`Unknown academy ${m.slug}`);
      const membership = await tx.membership.upsert({
        where: { tenantId_userId: { tenantId: academy.tenantId, userId } },
        create: { id: newId(), tenantId: academy.tenantId, userId, status: 'ACTIVE' },
        update: {},
        select: { id: true },
      });
      await tx.membershipRole.createMany({
        data: m.roles.map((key) => ({
          tenantId: academy.tenantId,
          membershipId: membership.id,
          roleId: academy.roles[key],
        })),
        skipDuplicates: true,
      });
    }

    if (existing?.credential) return 'already-set-up';
    // A brand-new user always gets a link; an existing one without a password only on --resend.
    if (existing && !opts.resend) return 'link-pending';

    const token = generateToken();
    await tx.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.passwordResetToken.create({
      data: {
        id: newId(),
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + LINK_TTL_MS),
      },
    });
    const academy = academies.get(first.slug)!;
    const branding = await tx.tenantBranding.findUnique({
      where: { tenantId: academy.tenantId },
      select: { displayName: true, primaryColor: true },
    });
    const email = EmailRequestSchema.parse({
      template: 'account_setup',
      to: u.email,
      locale: 'en-IN',
      host: { kind: 'academy', slug: first.slug },
      ...(branding ? { academy: branding } : {}),
      vars: {},
      link: { path: '/reset-password/{token}', sealedToken: encryptSecret(token, opts.keys) },
    });
    await tx.outboxEvent.create({
      data: { id: newId(), tenantId: academy.tenantId, type: EMAIL_OUTBOX_TYPE, payload: email },
    });
    await audit(tx, 'platform.staging_user_link_issued', 'User', userId, {
      newUser: !existing,
      academies: u.memberships.map((m) => m.slug),
    });
    return 'link-emailed';
  });
}

async function ensureConsoleAdmin(
  db: PrismaClient,
  email: string,
  resend: boolean,
  env: NodeJS.ProcessEnv,
): Promise<'link-emailed' | 'already-set-up' | 'link-pending'> {
  const existing = await db.user.findUnique({
    where: { email },
    select: {
      credential: { select: { userId: true } },
      platformStaff: { select: { status: true } },
    },
  });
  if (existing?.credential && existing.platformStaff) return 'already-set-up';
  if (existing?.platformStaff && !resend) return 'link-pending';
  // createAdmin emails the console link; its return value (the link) is deliberately discarded.
  await createAdmin(
    { email, name: 'Console Admin', newLink: Boolean(existing?.platformStaff) },
    env,
  );
  return 'link-emailed';
}

async function audit(
  tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await tx.auditLog.createMany({
    data: {
      id: newId(),
      tenantId: null,
      actorType: 'SYSTEM',
      action,
      entityType,
      entityId,
      metadata: { ...metadata, via: 'staging-bootstrap' } as never,
    },
  });
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { resend: { type: 'boolean', default: false } } });
  const outcome = await bootstrapStaging({ resend: values.resend });
  // Addresses and statuses only — never a password, token or link (C-78).
  const lines = [
    ...outcome.academies.map((a) => `academy ${a.slug}: ${a.created ? 'created' : 'exists'}`),
    ...outcome.users.map((u) => `${u.status.padEnd(15)} ${u.email}`),
    `${outcome.console.status.padEnd(15)} ${outcome.console.email} (console)`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
