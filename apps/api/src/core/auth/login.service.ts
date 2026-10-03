import { verifyAgainstDummy, verifyPassword } from '@academybee/auth';
import { type LoginOutcome, type LoginRequest, primaryExperience } from '@academybee/contracts';
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
import { MfaService } from './mfa.service.js';
import { SessionService } from './session.service.js';

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
   * Everyone else gets the same answer as a wrong password, so nothing about other hosts, academies
   * or staff accounts is revealed (ADR-006).
   */
  async login(input: LoginRequest, res: Response): Promise<LoginOutcome> {
    const resolved = this.cls.get('resolvedHost');
    if (resolved?.kind !== 'tenant' && resolved?.kind !== 'hub' && resolved?.kind !== 'console')
      throw new DomainError('NOT_FOUND', 'no sign-in on this host');
    const user = await this.verifyPassword(input);

    if (resolved.kind === 'tenant') {
      const tenantId = resolved.tenant.id;
      // Correct password: only an ACTIVE member of THIS academy may sign in here.
      const membership = await this.memberships.load(tenantId, user.id);
      if (!membership || membership.status !== 'ACTIVE')
        return this.refuse(user.id, 'not_a_member');
      await this.passwordSucceeded(user.id, input.identifier);
      if (primaryExperience(membership.roles) === 'hub') {
        // Parents and students use the Family Hub (G-31): continue there (C-61).
        return { handoff: { code: await this.hub.issueHandoff(user.id, tenantId) } };
      }
      return this.sessions.signInToAcademy(res, user, tenantId, membership.roles);
    }

    if (resolved.kind === 'hub') {
      if (!(await this.hub.academies(user.id)).length) return this.refuse(user.id, 'not_family');
      await this.passwordSucceeded(user.id, input.identifier);
      return this.sessions.signInToHub(res, user, 'password');
    }

    const staff = await this.sessions.platformStaff(user.id);
    if (staff?.status !== 'ACTIVE') return this.refuse(user.id, 'not_platform_staff');
    await this.passwordSucceeded(user.id, input.identifier);
    return { mfa: await this.mfa.begin(user.id) };
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
      throw new DomainError(
        'RATE_LIMITED',
        'account locked',
        undefined,
        (credential.lockedUntil.getTime() - Date.now()) / 1000,
      );
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
