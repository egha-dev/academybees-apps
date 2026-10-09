import { hashPassword, verifyPassword } from '@academybee/auth';
import type { MfaEnrolStartResponse, SecurityOverview } from '@academybee/contracts';
import type { TenantBoundClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { AnalyticsService } from '../analytics/analytics.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { RequestContext } from '../context/request-context.js';
import { TENANT_DB } from '../database/database.module.js';
import { EmailService } from '../email/email.service.js';
import { DomainError } from '../errors/domain-error.js';
import { RATE_RULES, RateLimiter } from '../rate-limit/rate-limiter.service.js';
import { TenantContext } from '../tenant/tenant-context.service.js';
import { DeviceService } from './device.service.js';
import { mfaRecommendedFor, MfaPolicyService } from './mfa-policy.service.js';
import { MfaService } from './mfa.service.js';
import { assertPasswordPolicy, identityParts } from './password.service.js';
import { SessionService } from './session.service.js';

/**
 * The signed-in user's own account security on an academy host (G-11, C-80): the 2FA state,
 * setting 2FA up or off, new recovery codes, and a password change. Changes that weaken or
 * replace a factor need the current password again; a password change signs out every other
 * device everywhere and sends the "password changed" email.
 */
@Injectable()
export class SecurityService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly context: TenantContext,
    private readonly mfa: MfaService,
    private readonly mfaPolicy: MfaPolicyService,
    private readonly sessions: SessionService,
    private readonly devices: DeviceService,
    private readonly emails: EmailService,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
    private readonly rate: RateLimiter,
  ) {}

  async overview(): Promise<SecurityOverview> {
    const { userId, roles } = this.me();
    const [status, required, credential] = await Promise.all([
      this.mfa.status(userId),
      this.mfaPolicy.isRequiredFor(roles),
      this.context.runAsUser(userId, () =>
        this.db.userCredential.findFirst({ select: { passwordUpdatedAt: true } }),
      ),
    ]);
    return {
      mfa: {
        enabled: status.enabled,
        enabledAt: status.enabledAt?.toISOString() ?? null,
        recoveryCodesLeft: status.recoveryCodesLeft,
        required,
        recommended: !status.enabled && mfaRecommendedFor(roles),
      },
      password: { updatedAt: credential?.passwordUpdatedAt.toISOString() ?? null },
    };
  }

  async mfaSetupStart(password: string): Promise<MfaEnrolStartResponse> {
    const { userId } = this.me();
    await this.reauthenticate(userId, password);
    return this.mfa.setupStart(userId);
  }

  /**
   * Confirm the first code: 2FA is on. Every other device (in every academy and the hub) is signed
   * out, so a session someone opened with the password alone doesn't outlive the new factor; they
   * sign in again with a code (review L8). This device stays signed in.
   */
  async mfaSetupConfirm(code: string): Promise<{ recoveryCodes: string[] }> {
    const { userId, sessionId } = this.me();
    const recoveryCodes = await this.mfa.setupConfirm(userId, sessionId, code);
    await this.sessions.revokeUserSessions(userId, 'mfa_enabled', undefined, { sessionId });
    return { recoveryCodes };
  }

  async regenerateRecoveryCodes(password: string): Promise<{ recoveryCodes: string[] }> {
    const { userId } = this.me();
    await this.reauthenticate(userId, password);
    return { recoveryCodes: await this.mfa.regenerateRecoveryCodes(userId) };
  }

  /**
   * Turn 2FA off — never while this academy requires it for the user's roles. Every other device
   * (in every academy and the hub) is signed out, so no session verified with the old factor
   * outlives it — including one in an academy that requires 2FA (C-80).
   */
  async disableMfa(password: string): Promise<void> {
    const { userId, sessionId, roles } = this.me();
    await this.reauthenticate(userId, password);
    if (await this.mfaPolicy.isRequiredFor(roles))
      throw new DomainError('CONFLICT', 'required by the academy', [
        { path: 'mfa', issue: 'required_by_academy' },
      ]);
    const email = await this.email(userId);
    await this.mfa.disable(userId, async (tx) => {
      if (email)
        await this.emails.request(tx, {
          template: 'mfa_disabled',
          to: email,
          locale: 'en-IN',
          ...(await this.devices.sender(tx)),
          vars: {},
        });
      await this.analytics.track(tx, 'auth.mfa_disabled', {});
    });
    await this.sessions.revokeUserSessions(userId, 'mfa_disabled', undefined, { sessionId });
  }

  /** Change the password; every other device (in every academy and the hub) is signed out. */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const { userId, sessionId } = this.me();
    await this.reauthenticate(userId, currentPassword);
    const user = await this.context.runAsUser(userId, () =>
      this.db.user.findFirst({ where: { id: userId }, select: { email: true, name: true } }),
    );
    if (!user) throw new DomainError('UNAUTHENTICATED', 'user missing');
    assertPasswordPolicy(newPassword, identityParts(user));
    if (currentPassword === newPassword)
      throw new DomainError('VALIDATION_FAILED', 'same password', [
        { path: 'newPassword', issue: 'same_as_current' },
      ]);
    const passwordHash = await hashPassword(newPassword);
    await this.context.runAsUser(userId, () =>
      this.db.$transaction(async (tx) => {
        await tx.userCredential.update({
          where: { userId },
          data: { passwordHash, passwordUpdatedAt: new Date(), failedCount: 0, lockedUntil: null },
        });
        // Any reset link still out there stops working.
        await tx.passwordResetToken.updateMany({
          where: { usedAt: null },
          data: { usedAt: new Date() },
        });
        if (user.email)
          await this.emails.request(tx, {
            template: 'password_changed',
            to: user.email,
            locale: 'en-IN',
            ...(await this.devices.sender(tx)),
            vars: {},
          });
        await this.audit.record(
          {
            action: 'auth.password_changed',
            actor: { type: 'USER', id: userId },
            entityType: 'User',
            entityId: userId,
          },
          tx,
        );
        await this.analytics.track(tx, 'auth.password_changed', {});
      }),
    );
    await this.sessions.revokeUserSessions(userId, 'password_changed', undefined, { sessionId });
  }

  /**
   * The current password again. Limited per user (5 a minute); a wrong one is audited but does
   * not count towards the sign-in lock, so a stolen session can't lock the owner out.
   */
  private async reauthenticate(userId: string, password: string): Promise<void> {
    await this.rate.consume(RATE_RULES.login, 'reauth', userId);
    const credential = await this.context.runAsUser(userId, () =>
      this.db.userCredential.findFirst({ select: { passwordHash: true } }),
    );
    if (!credential || !(await verifyPassword(credential.passwordHash, password))) {
      await this.audit.record({
        action: 'auth.reauth_failed',
        actor: { type: 'USER', id: userId },
      });
      throw new DomainError('INVALID_CREDENTIALS', 'wrong password');
    }
  }

  private async email(userId: string): Promise<string | null> {
    const user = await this.context.runAsUser(userId, () =>
      this.db.user.findFirst({ where: { id: userId }, select: { email: true } }),
    );
    return user?.email ?? null;
  }

  private me() {
    const userId = this.cls.get('userId');
    const session = this.cls.get('session');
    const membership = this.cls.get('membership');
    if (!userId || !session || !membership) throw new DomainError('UNAUTHENTICATED');
    return { userId, sessionId: session.id, roles: membership.roles };
  }
}
