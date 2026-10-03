import {
  type Audience,
  generateCsrfToken,
  generateToken,
  hashToken,
  type KeyRing,
  signAccessToken,
  verifyAgainstDummy,
  verifyPassword,
} from '@academybee/auth';
import {
  newId,
  primaryExperience,
  type ExperienceName,
  type LoginOutcome,
  type LoginRequest,
  type LoginResponse,
  type RoleKey,
} from '@academybee/contracts';
import { bindUser, type TenantBoundClient } from '@academybee/database';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { type Response } from 'express';
import { type Redis } from 'ioredis';
import { ClsService } from 'nestjs-cls';

import { AuditService } from '../audit/audit.service.js';
import { API_CONFIG } from '../config/config.module.js';
import { type ApiConfig } from '../config/config.schema.js';
import { type RequestContext } from '../context/request-context.js';
import { TENANT_DB } from '../database/database.module.js';
import { DomainError } from '../errors/domain-error.js';
import { RATE_RULES, RateLimiter } from '../rate-limit/rate-limiter.service.js';
import { REDIS } from '../redis/redis.module.js';
import { TenantContext } from '../tenant/tenant-context.service.js';
import { normalizeIdentifier } from './identifier.js';
import { HubService } from './hub.service.js';
import { MfaService } from './mfa.service.js';
import {
  clearSessionCookies,
  deviceLabel,
  hostAudience,
  REFRESH_TTL_MS,
  setSessionCookies,
} from './http.js';
import { AUTH_KEYS } from './keys.js';
import { MembershipService } from './membership.service.js';

const DAY = 24 * 3600 * 1000;
/** Lock after this many consecutive failures; the lock doubles per further failure (≤ 60 min). */
const LOCK_AFTER = 5;
/** A rotated refresh token presented again within this window is a parallel-tab race, not theft. */
const ROTATION_GRACE_MS = 20_000;
/** Session-validity cache (revocation deletes the key). */
const SESSION_KEY = (sid: string) => `auth:sess:${sid}`;

/** Where each experience starts (ARCHITECTURE §10.2; homes behind `p2-role-homes` until 5/6). */
export const HOME: Record<ExperienceName, string> = { manage: '/today', teach: '/teach', hub: '/' };

@Injectable()
export class SessionService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(AUTH_KEYS) private readonly keys: KeyRing,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly cls: ClsService<RequestContext>,
    private readonly context: TenantContext,
    private readonly memberships: MembershipService,
    private readonly audit: AuditService,
    private readonly rate: RateLimiter,
    @Inject(forwardRef(() => HubService)) private readonly hub: HubService,
    @Inject(forwardRef(() => MfaService)) private readonly mfa: MfaService,
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
      return this.signInToAcademy(res, user, tenantId, membership.roles);
    }

    if (resolved.kind === 'hub') {
      if (!(await this.hub.academies(user.id)).length) return this.refuse(user.id, 'not_family');
      await this.passwordSucceeded(user.id, input.identifier);
      return this.signInToHub(res, user, 'password');
    }

    const staff = await this.mfa.platformStaff(user.id);
    if (staff?.status !== 'ACTIVE') return this.refuse(user.id, 'not_platform_staff');
    await this.passwordSucceeded(user.id, input.identifier);
    return { mfa: await this.mfa.begin(user.id) };
  }

  /** Start a HUB session (sign-in on `app.` or a handoff, C-61). */
  async signInToHub(
    res: Response,
    user: { id: string; name: string },
    via: 'password' | 'handoff',
  ): Promise<LoginResponse> {
    await this.startSession(res, { userId: user.id, audience: 'HUB' });
    await this.audit.record({
      action: 'auth.login',
      tenantId: null,
      actor: { type: 'USER', id: user.id },
      entityType: 'User',
      entityId: user.id,
      metadata: { audience: 'HUB', via },
    });
    return { user: { name: user.name }, experience: 'hub', redirectTo: HOME.hub };
  }

  /** Start a CONSOLE session once the second factor is verified (C-66). */
  async signInToConsole(res: Response, user: { id: string; name: string }): Promise<LoginResponse> {
    await this.startSession(res, {
      userId: user.id,
      audience: 'CONSOLE',
      mfaVerifiedAt: new Date(),
    });
    await this.audit.record({
      action: 'auth.login',
      tenantId: null,
      actor: { type: 'PLATFORM_STAFF', id: user.id },
      entityType: 'User',
      entityId: user.id,
      metadata: { audience: 'CONSOLE' },
    });
    return { user: { name: user.name }, redirectTo: '/' };
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
      await this.recordFailure(user.id, credential.failedCount + 1);
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

  /**
   * Start a TENANT session for a verified user who is an ACTIVE member of this academy (sign-in,
   * invitation accept) and say where to go.
   */
  async signInToAcademy(
    res: Response,
    user: { id: string; name: string },
    tenantId: string,
    roles: readonly RoleKey[],
  ): Promise<LoginResponse> {
    const experience = primaryExperience(roles);
    await this.startSession(res, { userId: user.id, audience: 'TENANT', tenantId });
    await this.audit.record({
      action: 'auth.login',
      actor: { type: 'USER', id: user.id },
      entityType: 'User',
      entityId: user.id,
    });
    return {
      user: { name: user.name },
      ...(experience ? { experience } : {}),
      redirectTo: experience ? HOME[experience] : '/',
    };
  }

  /**
   * Revoke a user's live sessions — every one, or only those in one academy — and drop them from
   * the validity cache (password reset, disabled membership). Server-decided, so it binds the
   * target user for RLS (C-59).
   */
  async revokeUserSessions(
    userId: string,
    reason: string,
    only?: { tenantId: string },
  ): Promise<number> {
    const where = { revokedAt: null, ...(only ? { tenantId: only.tenantId } : {}) };
    const sessions = await this.context.runAsUser(userId, () =>
      this.db.authSession.findMany({ where, select: { id: true } }),
    );
    if (!sessions.length) return 0;
    await this.context.runAsUser(userId, () =>
      this.db.authSession.updateMany({
        where: { id: { in: sessions.map((x) => x.id) }, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: reason },
      }),
    );
    await this.redis.del(...sessions.map((x) => SESSION_KEY(x.id))).catch(() => undefined);
    return sessions.length;
  }

  /** A wrong password for a known user: counts towards the account lock (ADR-006). */
  async passwordFailed(userId: string, failedCount: number): Promise<void> {
    await this.recordFailure(userId, failedCount);
  }

  /** Rotate the refresh token (ADR-007). A rotated token presented again revokes the family. */
  async refresh(refreshToken: string | undefined, res: Response): Promise<void> {
    if (!refreshToken) throw new DomainError('UNAUTHENTICATED', 'no refresh cookie');
    const hash = hashToken(refreshToken);
    const session = await this.db.$withLookup({ token: hash }, (tx) =>
      tx.authSession.findFirst({ where: { refreshTokenHash: hash } }),
    );
    if (!session) {
      clearSessionCookies(res, this.config.COOKIE_MODE);
      throw new DomainError('UNAUTHENTICATED', 'unknown refresh token');
    }
    this.assertSessionHost(session.audience, session.tenantId, session.userId);

    if (session.revokedAt) {
      if (
        session.revokeReason === 'rotated' &&
        Date.now() - session.revokedAt.getTime() < ROTATION_GRACE_MS
      ) {
        // Two tabs refreshed at once; the browser already holds the new cookies. Retry, don't punish.
        throw new DomainError('CONFLICT', 'refresh race');
      }
      if (session.revokeReason === 'rotated') {
        await this.revokeFamily(session.userId, session.familyId, 'reuse_detected');
        await this.audit.record({
          action: 'auth.refresh_reuse',
          actor: { type: 'USER', id: session.userId },
          entityType: 'AuthSession',
          entityId: session.familyId,
        });
      }
      clearSessionCookies(res, this.config.COOKIE_MODE);
      throw new DomainError('UNAUTHENTICATED', 'revoked session');
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      clearSessionCookies(res, this.config.COOKIE_MODE);
      throw new DomainError('SESSION_EXPIRED', 'refresh expired');
    }
    if (session.audience === 'TENANT' && session.tenantId) {
      const membership = await this.memberships.load(session.tenantId, session.userId);
      if (membership?.status !== 'ACTIVE') {
        await this.revokeFamily(session.userId, session.familyId, 'membership_inactive');
        clearSessionCookies(res, this.config.COOKIE_MODE);
        throw new DomainError('UNAUTHENTICATED', 'membership inactive');
      }
    }
    if (session.audience === 'CONSOLE') {
      const staff = await this.mfa.platformStaff(session.userId);
      if (staff?.status !== 'ACTIVE' || !session.mfaVerifiedAt) {
        await this.revokeFamily(session.userId, session.familyId, 'staff_inactive');
        clearSessionCookies(res, this.config.COOKIE_MODE);
        throw new DomainError('UNAUTHENTICATED', 'platform staff inactive');
      }
    }

    await this.context.runAsUser(session.userId, () =>
      this.db.authSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date(), revokeReason: 'rotated' },
      }),
    );
    await this.redis.del(SESSION_KEY(session.id)).catch(() => undefined);
    await this.startSession(res, {
      userId: session.userId,
      audience: session.audience,
      tenantId: session.tenantId ?? undefined,
      familyId: session.familyId,
      deviceLabel: session.deviceLabel ?? undefined,
      mfaVerifiedAt: session.mfaVerifiedAt ?? undefined,
    });
  }

  /** Sign out this device, or every device of this audience (G-11). */
  async logout(sessionId: string | undefined, everywhere: boolean, res: Response): Promise<void> {
    const userId = this.cls.get('userId');
    if (sessionId && userId) {
      const audience = this.cls.get('session')?.audience ?? 'TENANT';
      const tenantId = this.cls.get('tenantId');
      const sessions = await this.context.runAsUser(userId, () =>
        this.db.authSession.findMany({
          where: everywhere
            ? {
                revokedAt: null,
                audience,
                ...(audience === 'TENANT' && tenantId ? { tenantId } : {}),
              }
            : { id: sessionId, revokedAt: null },
          select: { id: true },
        }),
      );
      await this.context.runAsUser(userId, () =>
        this.db.authSession.updateMany({
          where: { id: { in: sessions.map((s) => s.id) } },
          data: { revokedAt: new Date(), revokeReason: everywhere ? 'logout_all' : 'logout' },
        }),
      );
      if (sessions.length)
        await this.redis.del(...sessions.map((s) => SESSION_KEY(s.id))).catch(() => undefined);
      await this.audit.record({
        action: everywhere ? 'auth.logout_all' : 'auth.logout',
        actor: { type: 'USER', id: userId },
      });
    }
    clearSessionCookies(res, this.config.COOKIE_MODE);
  }

  /** Is the session still valid? Cached for a minute; revocation deletes the cache key. */
  async isSessionActive(sessionId: string, userId: string): Promise<boolean> {
    if ((await this.redis.get(SESSION_KEY(sessionId)).catch(() => null)) === '1') return true;
    const row = await this.context.runAsUser(userId, () =>
      this.db.authSession.findFirst({
        where: { id: sessionId, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true },
      }),
    );
    if (row) await this.redis.set(SESSION_KEY(sessionId), '1', 'EX', 60).catch(() => undefined);
    return row !== null;
  }

  private assertSessionHost(audience: Audience, tenantId: string | null, userId: string): void {
    const resolved = this.cls.get('resolvedHost');
    if (audience !== hostAudience(resolved))
      throw new DomainError('UNAUTHENTICATED', 'session audience');
    if (audience === 'TENANT' && resolved?.kind === 'tenant' && tenantId !== resolved.tenant.id) {
      void this.context.run(undefined, () =>
        this.audit.record({
          action: 'auth.tenant_mismatch',
          tenantId: null,
          actor: { type: 'USER', id: userId },
          metadata: { via: 'refresh' },
        }),
      );
      throw new DomainError('TENANT_MISMATCH');
    }
  }

  private async startSession(
    res: Response,
    input: {
      userId: string;
      audience: Audience;
      tenantId?: string | undefined;
      familyId?: string;
      deviceLabel?: string | undefined;
      mfaVerifiedAt?: Date | undefined;
    },
  ): Promise<void> {
    // Console sessions exist only after the second factor (C-66).
    if (input.audience === 'CONSOLE' && !input.mfaVerifiedAt)
      throw new Error('console sessions need a verified second factor');
    const refresh = generateToken();
    const sessionId = newId();
    await this.context.runAsUser(input.userId, () =>
      this.db.authSession.create({
        data: {
          id: sessionId,
          userId: input.userId,
          tenantId: input.audience === 'TENANT' ? (input.tenantId ?? null) : null,
          audience: input.audience,
          familyId: input.familyId ?? newId(),
          refreshTokenHash: hashToken(refresh),
          deviceLabel: input.deviceLabel ?? deviceLabel(this.cls.get('userAgent')),
          ip: this.cls.get('ip') ?? null,
          userAgent: this.cls.get('userAgent') ?? null,
          expiresAt: new Date(Date.now() + REFRESH_TTL_MS[input.audience] * DAY),
          mfaVerifiedAt: input.mfaVerifiedAt ?? null,
        },
      }),
    );
    const access = await signAccessToken(
      {
        sub: input.userId,
        sid: sessionId,
        aud: input.audience,
        ...(input.audience === 'TENANT' && input.tenantId ? { tid: input.tenantId } : {}),
        ver: 1,
      },
      this.keys,
    );
    setSessionCookies(res, this.config.COOKIE_MODE, input.audience, {
      access,
      refresh,
      csrf: generateCsrfToken(),
    });
  }

  private async recordFailure(userId: string, failedCount: number): Promise<void> {
    const lockMinutes =
      failedCount >= LOCK_AFTER ? Math.min(2 ** (failedCount - LOCK_AFTER), 60) : 0;
    await this.context.runAsUser(userId, () =>
      this.db.userCredential.update({
        where: { userId },
        data: {
          failedCount,
          ...(lockMinutes ? { lockedUntil: new Date(Date.now() + lockMinutes * 60_000) } : {}),
        },
      }),
    );
    await this.audit.record({
      action: lockMinutes ? 'auth.locked' : 'auth.login_failed',
      actor: { type: 'USER', id: userId },
      metadata: { reason: 'password', failedCount, lockMinutes },
    });
  }

  private async revokeFamily(userId: string, familyId: string, reason: string): Promise<void> {
    const sessions = await this.context.runAsUser(userId, () =>
      this.db.authSession.findMany({ where: { familyId }, select: { id: true } }),
    );
    await this.context.runAsUser(userId, () =>
      this.db.authSession.updateMany({
        where: { familyId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: reason },
      }),
    );
    if (sessions.length)
      await this.redis.del(...sessions.map((s) => SESSION_KEY(s.id))).catch(() => undefined);
  }
}
