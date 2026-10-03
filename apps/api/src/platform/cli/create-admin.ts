// `pnpm platform:create-admin --email you@example.com [--name "Your Name"] [--new-link]`
//
// Bootstraps console access (C-02, C-66): creates (or reuses) the user, makes them ACTIVE platform
// staff (SUPER_ADMIN), and issues a one-time set-password link for the console (24 h). The link is
// printed and emailed (outbox → worker; the token travels sealed, C-62). The first console sign-in
// then forces TOTP enrolment. Platform code: uses the ab_platform client (ADR-005), and every run
// writes a platform audit row. `--new-link` issues a fresh link for existing staff.
import { parseArgs } from 'node:util';

import { encryptSecret, generateToken, hashToken, loadMasterKeys } from '@academybee/auth';
import { EMAIL_OUTBOX_TYPE, EmailRequestSchema, newId } from '@academybee/contracts';
import { createPlatformClient } from '@academybee/database/platform';
import { z } from 'zod';

const LINK_TTL_MS = 24 * 3600 * 1000;

const Env = z.object({
  APP_ENV: z.enum(['local', 'ci', 'staging', 'production']),
  PLATFORM_DATABASE_URL: z.string().min(1),
  SECRETS_MASTER_KEY: z.string().min(1),
  PLATFORM_ROOT_DOMAIN: z.string().optional(),
  WEB_PUBLIC_PROTOCOL: z.enum(['http', 'https']).optional(),
  WEB_PUBLIC_PORT: z.string().optional(),
});

export type CreateAdminResult = { userId: string; created: boolean; link: string };

export async function createAdmin(
  input: { email: string; name?: string | undefined; newLink?: boolean },
  env: NodeJS.ProcessEnv = process.env,
): Promise<CreateAdminResult> {
  const cfg = Env.parse(env);
  const email = z.email().parse(input.email.trim().toLowerCase());
  const name = (input.name ?? email.split('@')[0] ?? 'Admin').slice(0, 120);
  const local = cfg.APP_ENV === 'local' || cfg.APP_ENV === 'ci';
  const root = cfg.PLATFORM_ROOT_DOMAIN ?? (local ? 'localhost' : undefined);
  if (!root) throw new Error('PLATFORM_ROOT_DOMAIN is required outside local/ci');
  const protocol = cfg.WEB_PUBLIC_PROTOCOL ?? (local ? 'http' : 'https');
  const port = cfg.WEB_PUBLIC_PORT ?? (local ? '3000' : '');
  const keys = loadMasterKeys(cfg.SECRETS_MASTER_KEY);

  const db = createPlatformClient(cfg.PLATFORM_DATABASE_URL, { maxConnections: 1 });
  try {
    const token = generateToken();
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email },
        select: { id: true, status: true, platformStaff: { select: { status: true } } },
      });
      if (existing?.status === 'DISABLED') throw new Error('this user is disabled');
      if (existing?.platformStaff && !input.newLink)
        throw new Error(
          'already platform staff — pass --new-link to issue a new set-password link',
        );
      const userId = existing?.id ?? newId();
      if (!existing) await tx.user.create({ data: { id: userId, email, name } });
      await tx.platformStaff.upsert({
        where: { userId },
        create: { userId, platformRole: 'SUPER_ADMIN' },
        update: {},
      });
      // Only the newest link works.
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
      const email_ = EmailRequestSchema.parse({
        template: 'platform_admin_invite',
        to: email,
        locale: 'en-IN',
        host: { kind: 'console' },
        vars: {},
        link: { path: '/set-password/{token}', sealedToken: encryptSecret(token, keys) },
      });
      await tx.outboxEvent.create({
        data: { id: newId(), tenantId: null, type: EMAIL_OUTBOX_TYPE, payload: email_ },
      });
      await tx.auditLog.createMany({
        data: {
          id: newId(),
          tenantId: null,
          actorType: 'SYSTEM',
          action: existing?.platformStaff ? 'platform.staff_link_issued' : 'platform.staff_created',
          entityType: 'User',
          entityId: userId,
          metadata: { role: 'SUPER_ADMIN', via: 'cli', newUser: !existing },
        },
      });
      return { userId, created: !existing };
    });
    const link = `${protocol}://console.${root}${port ? `:${port}` : ''}/set-password/${token}`;
    return { ...result, link };
  } finally {
    await db.$disconnect();
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      'new-link': { type: 'boolean', default: false },
    },
  });
  if (!values.email) {
    console.error(
      'Usage: pnpm platform:create-admin --email you@example.com [--name "Name"] [--new-link]',
    );
    process.exit(2);
  }
  const result = await createAdmin({
    email: values.email,
    name: values.name,
    newLink: values['new-link'],
  });
  // A CLI's result goes to stdout.
  process.stdout.write(
    [
      result.created ? 'Created console admin.' : 'Console admin ready.',
      'Set-password link (24 hours, one use — also emailed):',
      result.link,
      'The first console sign-in asks you to set up an authenticator app.',
    ].join('\n') + '\n',
  );
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
