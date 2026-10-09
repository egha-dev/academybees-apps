import { verifyAgainstDummy, verifyPassword } from '@academybee/auth';
import {
  type LoginOutcome,
  type LoginRequest,
  type MfaEnrolConfirmResponse,
  type MfaVerifyResponse,
  primaryExperience,
  type RoleKey,
} from '@academybee/contracts';
import { bindUser, type TenantBoundClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { type Response } from 'express';
import { ClsService } from 'nestjs-cls';

import { AuditService } from '../audit/audit.service.js';
import { type RequestContext } from '../context/request-context.js';
import { TENANT_DB } from '../database/database.module.js';
import { DomainError } from '../errors/domain-error.js';
import { RATE_RULES, RateLimiter } from '../rate-limit/rate-limiter.service.js';
import { TenantContext } from '../tenant/tenant-context.service.js';
import { HubService } from './hub.service.js';
import { normalizeIdentifier } from './identifier.js';
import { MembershipService } from './membership.service.js';
import { mfaRecommendedFor, MfaPolicyService } from './mfa-policy.service.js';
import { type MfaCode, MfaService, type PendingMfa } from './mfa.service.js';
import { isAcademyOpen, SessionService } from './session.service.js';

/**
 * `POST /auth/login` on every host. Depends on the session, hub and MFA services; nothing
 * depends on it, so the auth services form no import cycle.
 */
@Injectable()
export class LoginService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly context: TenantContext,
    private readonly memberships: MembershipService,
    private readonly sessions: SessionService,
    private readonly hub: HubService,
    private readonly mfa: MfaService,
    private readonly mfaPolicy: MfaPolicyService,
    private readonly audit: AuditService,
    private readonly rate: RateLimiter,
  ) {}

  /**
   * Sign-in on any host (ARCHITECTURE §9.3). The password check is shared; what happens next
   * depends on the host:
   * - academy: an ACTIVE member of this academy gets a TENANT session; a parent/student is handed
   *   off to the Family Hub with a one-time code (C-61);
   * - Family Hub: a user with an ACTIVE parent/student membership anywhere gets a HUB session;
   * - console: ACTIVE platform staff get an MFA step (enrol or verify) — never a session yet (C-66).
   * On academy and hub hosts a user with 2FA gets the `verify` step, and a member whose roles this
   * academy requires 2FA for gets `enrol` until they have it (C-80).
   * Everyone else gets the same answer as a wrong password, so nothing about other hosts, academies
   * or staff accounts is revealed (ADR-006).
   */
  async login(input: LoginRequest, res: Response): Promise<LoginOutcome> {
    const resolved = this.cls.get('resolvedHost');
    if (resolved?.kind !== 'tenant' && resolved?.kind !== 'hub' && resolved?.kind !== 'console')
      throw new DomainError('NOT_FOUND', 'no sign-in on this host');
    // A suspended or archived academy shows its status page; no password is checked (C-86).
    if (resolved.kind === 'tenant' && !isAcademyOpen(resolved.tenant.status))
      throw new DomainError('TENANT_UNAVAILABLE', 'academy not open');
    const user = await this.verifyPassword(input);

    if (resolved.kind === 'tenant') {
      const tenantId = resolved.tenant.id;
      // Correct password: only an ACTIVE member of THIS academy may sign in here.
      const membership = await this.memberships.load(tenantId, user.id);
      if (!membership || membership.status !== 'ACTIVE')
        return this.refuse(user.id, 'not_a_member');
      await this.passwordSucceeded(user.id, input.identifier);
      if (
        (await this.mfa.isEnabled(user.id)) ||
        (await this.mfaPolicy.isRequiredFor(membership.roles))
      )
        return { mfa: await this.mfa.begin(user.id, 'TENANT', tenantId) };
      return this.enterAcademy(res, user, tenantId, membership.roles);
    }

    if (resolved.kind === 'hub') {
      if (!(await this.hub.academies(user.id)).length) return this.refuse(user.id, 'not_family');
      await this.passwordSucceeded(user.id, input.identifier);
      if (await this.mfa.isEnabled(user.id)) return { mfa: await this.mfa.begin(user.id, 'HUB') };
      return this.sessions.signInToHub(res, user, 'password');
    }

    const staff = await this.sessions.platformStaff(user.id);
    if (staff?.status !== 'ACTIVE') return this.refuse(user.id, 'not_platform_staff');
    await this.passwordSucceeded(user.id, input.identifier);
    return { mfa: await this.mfa.begin(user.id, 'CONSOLE') };
  }

  /** Sign-in second step (`POST /auth/mfa/verify`): a code, then the session. */
  async verifyMfa(token: string, code: MfaCode, res: Response): Promise<MfaVerifyResponse> {
    return this.completeMfa(await this.mfa.verify(token, code), res);
  }

  /** Mandatory enrolment (`POST /auth/mfa/enrol/confirm`): recovery codes and the session. */
  async confirmMfaEnrolment(
    token: string,
    code: string,
    res: Response,
  ): Promise<MfaEnrolConfirmResponse> {
    const { pending, recoveryCodes } = await this.mfa.enrolConfirm(token, code);
    const outcome = await this.completeMfa(pending, res);
    // Enrolment is only ever mandatory for staff, who never hand off to the Family Hub.
    if ('handoff' in outcome) throw new DomainError('CONFLICT', 'enrolment without a session');
    return { ...outcome, recoveryCodes };
  }

  /**
   * The second factor is verified: re-check who the user is on this host (they may have been
   * disabled in the last five minutes) and sign in.
   */
  private async completeMfa(pending: PendingMfa, res: Response): Promise<MfaVerifyResponse> {
    const user = await this.activeUser(pending.userId);
    const mfaVerifiedAt = new Date();
    if (pending.audience === 'CONSOLE') {
      const staff = await this.sessions.platformStaff(user.id);
      if (staff?.status !== 'ACTIVE') return this.refuse(user.id, 'not_platform_staff');
      return this.sessions.signInToConsole(res, user);
    }
    if (pending.audience === 'HUB') {
      if (!(await this.hub.academies(user.id)).length) return this.refuse(user.id, 'not_family');
      return this.sessions.signInToHub(res, user, 'password', mfaVerifiedAt);
    }
    const tenantId = pending.tenantId ?? '';
    const membership = await this.memberships.load(tenantId, user.id);
    if (membership?.status !== 'ACTIVE') return this.refuse(user.id, 'not_a_member');
    return this.enterAcademy(res, user, tenantId, membership.roles, mfaVerifiedAt);
  }

  /** Staff get a TENANT session; parents and students continue on the Family Hub (C-61). */
  private async enterAcademy(
    res: Response,
    user: { id: string; name: string },
    tenantId: string,
    roles: readonly RoleKey[],
    mfaVerifiedAt?: Date,
  ): Promise<MfaVerifyResponse> {
    if (primaryExperience(roles) === 'hub')
      return { handoff: { code: await this.hub.issueHandoff(user.id, tenantId) } };
    return this.sessions.signInToAcademy(res, user, tenantId, roles, {
      mfaVerifiedAt,
      promptMfa: !mfaVerifiedAt && mfaRecommendedFor(roles),
    });
  }

  private async activeUser(userId: string): Promise<{ id: string; name: string }> {
    const user = await this.context.runAsUser(userId, () =>
      this.db.user.findFirst({
        where: { id: userId },
        select: { id: true, name: true, status: true },
      }),
    );
    if (user?.status !== 'ACTIVE') return this.refuse(userId, 'user_inactive');
    return { id: user.id, name: user.name };
  }

  /** Identifier + password with rate limits and the account lock; returns the ACTIVE user. */
  private async verifyPassword(input: LoginRequest): Promise<{ id: string; name: string }> {
    const ip = this.cls.get('ip') ?? 'unknown';
    const identifier = normalizeIdentifier(input.identifier);

    await this.rate.consume(RATE_RULES.loginIp, ip);
    await this.rate.consume(RATE_RULES.login, ip, identifier?.value ?? input.identifier);

    const found = identifier
      ? await this.db.$withLookup({ identifier: identifier.value }, async (tx) => {
          const user = await tx.user.findFirst({
            where:
              identifier.kind === 'email'
                ? { email: identifier.value }
                : // A phone signs in only once verified (C-65).
                  { phone: identifier.value, phoneVerifiedAt: { not: null } },
            select: { id: true, name: true, status: true },
          });
          if (!user) return null;
          await bindUser(tx, user.id);
          const credential = await tx.userCredential.findFirst({
            select: { passwordHash: true, failedCount: true, lockedUntil: true },
          });
          return { user, credential };
        })
      : null;

    if (!found?.credential || found.user.status !== 'ACTIVE') {
      await verifyAgainstDummy(input.password);
      await this.audit.record({ action: 'auth.login_failed', metadata: { reason: 'unknown' } });
      throw new DomainError('INVALID_CREDENTIALS');
    }
    const { user, credential } = found;
    if (credential.lockedUntil && credential.lockedUntil.getTime() > Date.now()) {
      // Answered exactly like a wrong password (same code, same password-hash work): a distinct
      // "locked" answer would tell anyone that an AcademyBee account exists for this address
      // (review L1, ADR-006). The person still sees "try again in …" from the per-identifier
      // limit, which applies to every address alike.
      await verifyAgainstDummy(input.password);
      await this.audit.record({
        action: 'auth.login_failed',
        actor: { type: 'USER', id: user.id },
        metadata: { reason: 'locked' },
      });
      throw new DomainError('INVALID_CREDENTIALS', 'account locked');
    }
    if (!(await verifyPassword(credential.passwordHash, input.password))) {
      await this.sessions.passwordFailed(user.id, credential.failedCount + 1);
      throw new DomainError('INVALID_CREDENTIALS');
    }
    return { id: user.id, name: user.name };
  }

  /** A correct password that may not sign in on this host: the wrong-password answer, audited. */
  private async refuse(userId: string, reason: string): Promise<never> {
    await this.audit.record({
      action: 'auth.login_failed',
      actor: { type: 'USER', id: userId },
      metadata: { reason },
    });
    throw new DomainError('INVALID_CREDENTIALS');
  }

  private async passwordSucceeded(userId: string, rawIdentifier: string): Promise<void> {
    const identifier = normalizeIdentifier(rawIdentifier);
    await this.context.runAsUser(userId, () =>
      this.db.$transaction(async (tx) => {
        await tx.userCredential.update({
          where: { userId },
          data: { failedCount: 0, lockedUntil: null },
        });
        await tx.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
      }),
    );
    await this.rate.reset(
      RATE_RULES.login,
      this.cls.get('ip') ?? 'unknown',
      identifier?.value ?? rawIdentifier,
    );
  }
}
