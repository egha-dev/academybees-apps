import { checkPassword, generateToken, hashPassword, hashToken } from '@academybee/auth';
import { newId } from '@academybee/contracts';
import { bindUser, type TenantBoundClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { AnalyticsService } from '../analytics/analytics.service.js';
import { AuditService } from '../audit/audit.service.js';
import { type RequestContext } from '../context/request-context.js';
import { TENANT_DB } from '../database/database.module.js';
import { EmailService } from '../email/email.service.js';
import { DomainError } from '../errors/domain-error.js';
import { RATE_RULES, RateLimiter } from '../rate-limit/rate-limiter.service.js';
import { TenantContext } from '../tenant/tenant-context.service.js';
import { MembershipService } from './membership.service.js';
import { SessionService } from './session.service.js';

const RESET_TTL_MS = 3600 * 1000;

/** Policy problems as validation details (the UI explains each, OD-04). */
export function assertPasswordPolicy(password: string, identifiers: readonly string[]): void {
  const check = checkPassword(password, identifiers);
  if (!check.ok)
    throw new DomainError(
      'VALIDATION_FAILED',
      'password policy',
      check.problems.map((issue) => ({ path: 'password', issue })),
    );
}

/** The parts of a user's identity a password must not contain. */
export function identityParts(user: { email: string | null; name?: string | null }): string[] {
  return [user.email?.split('@')[0] ?? '', ...(user.name ?? '').split(/\s+/)].filter(
    (p) => p.length >= 3,
  );
}

/**
 * Forgotten passwords (ARCHITECTURE §6, C-67). Requested on an academy host; the answer never
 * says whether the email has an account. A link (1 h, single use) is sent only to an ACTIVE user
 * who is an ACTIVE member of this academy. Resetting revokes every session everywhere and sends
 * a "password changed" alert; the user then signs in again.
 */
@Injectable()
export class PasswordService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly context: TenantContext,
    private readonly memberships: MembershipService,
    private readonly sessions: SessionService,
    private readonly emails: EmailService,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
    private readonly rate: RateLimiter,
  ) {}

  async forgot(email: string): Promise<void> {
    const tenantId = this.academyId();
    const ip = this.cls.get('ip') ?? 'unknown';
    await this.rate.consume(RATE_RULES.loginIp, ip);
    await this.rate.consume(RATE_RULES.resetOrInvite, email);

    const user = await this.db.$withLookup({ identifier: email }, (tx) =>
      tx.user.findFirst({ where: { email }, select: { id: true, status: true } }),
    );
    const membership = user ? await this.memberships.load(tenantId, user.id) : null;
    if (!user || user.status !== 'ACTIVE' || membership?.status !== 'ACTIVE') {
      await this.audit.record({
        action: 'auth.password_reset_requested',
        metadata: { sent: false },
      });
      return;
    }

    const token = generateToken();
    await this.context.runAsUser(user.id, () =>
      this.db.$transaction(async (tx) => {
        // Only the newest link works.
        await tx.passwordResetToken.updateMany({
          where: { usedAt: null },
          data: { usedAt: new Date() },
        });
        await tx.passwordResetToken.create({
          data: {
            id: newId(),
            userId: user.id,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + RESET_TTL_MS),
          },
        });
        await this.emails.request(tx, {
          template: 'password_reset',
          to: email,
          locale: 'en-IN',
          ...(await this.emails.academySender(tx)),
          vars: {},
          link: { path: '/reset-password#token={token}', token },
        });
        await this.audit.record(
          {
            action: 'auth.password_reset_requested',
            actor: { type: 'USER', id: user.id },
            entityType: 'User',
            entityId: user.id,
            metadata: { sent: true },
          },
          tx,
        );
      }),
    );
  }

  /**
   * Set a new password with a reset link: on an academy host, or on the console for the
   * set-password link `platform:create-admin` issues (C-66).
   */
  async reset(token: string, password: string): Promise<void> {
    const kind = this.cls.get('resolvedHost')?.kind;
    if (kind !== 'tenant' && kind !== 'console')
      throw new DomainError('NOT_FOUND', 'no reset here');
    await this.rate.consume(RATE_RULES.tokenAttempts, this.cls.get('ip') ?? 'unknown');
    const hash = hashToken(token);
    const found = await this.db.$withLookup({ token: hash }, async (tx) => {
      const row = await tx.passwordResetToken.findFirst({
        where: { tokenHash: hash, usedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, userId: true },
      });
      if (!row) return null;
      await bindUser(tx, row.userId);
      const user = await tx.user.findFirst({
        where: { id: row.userId },
        select: { email: true, name: true, status: true },
      });
      return user ? { ...row, user } : null;
    });
    // Unknown, used, expired and disabled all look the same.
    if (!found || found.user.status !== 'ACTIVE')
      throw new DomainError('NOT_FOUND', 'reset link not valid');
    assertPasswordPolicy(password, identityParts(found.user));
    const passwordHash = await hashPassword(password);

    await this.context.runAsUser(found.userId, () =>
      this.db.$transaction(async (tx) => {
        const claimed = await tx.passwordResetToken.updateMany({
          where: { id: found.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (claimed.count !== 1) throw new DomainError('NOT_FOUND', 'reset link already used');
        await tx.passwordResetToken.updateMany({
          where: { usedAt: null },
          data: { usedAt: new Date() },
        });
        await tx.userCredential.upsert({
          where: { userId: found.userId },
          create: { userId: found.userId, passwordHash },
          update: {
            passwordHash,
            passwordUpdatedAt: new Date(),
            failedCount: 0,
            lockedUntil: null,
          },
        });
        if (found.user.email) {
          await this.emails.request(tx, {
            template: 'password_changed',
            to: found.user.email,
            locale: 'en-IN',
            ...(kind === 'tenant'
              ? await this.emails.academySender(tx)
              : { host: { kind: 'console' as const } }),
            vars: {},
          });
        }
        await this.audit.record(
          {
            action: 'auth.password_reset',
            actor: { type: 'USER', id: found.userId },
            entityType: 'User',
            entityId: found.userId,
          },
          tx,
        );
        await this.analytics.track(tx, 'auth.password_reset', {});
      }),
    );
    await this.sessions.revokeUserSessions(found.userId, 'password_reset');
  }

  private academyId(): string {
    const resolved = this.cls.get('resolvedHost');
    if (resolved?.kind !== 'tenant') throw new DomainError('NOT_FOUND', 'academy host only');
    return resolved.tenant.id;
  }
}
