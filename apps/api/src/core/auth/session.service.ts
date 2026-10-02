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
  type LoginRequest,
} from '@academybee/contracts';
import { bindUser, type TenantBoundClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
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
import { clearSessionCookies, deviceLabel, REFRESH_TTL_MS, setSessionCookies } from './http.js';
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
const HOME: Record<ExperienceName, string> = { manage: '/today', teach: '/teach', hub: '/' };

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
  ) {}

  /** Staff sign-in on an academy host (TENANT audience). Hub and console arrive in S8. */
  async login(input: LoginRequest, res: Response) {
    const resolved = this.cls.get('resolvedHost');
    if (resolved?.kind !== 'tenant')
      throw new DomainError('NOT_FOUND', 'sign-in host not supported yet');
    const tenantId = resolved.tenant.id;
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

    // Correct password: only an ACTIVE member of THIS academy may sign in here. Everyone else gets
    // the same answer as a wrong password, so other academies' members are not revealed (ADR-006).
    const membership = await this.memberships.load(tenantId, user.id);
    if (!membership || membership.status !== 'ACTIVE') {
      await this.audit.record({
        action: 'auth.login_failed',
        actor: { type: 'USER', id: user.id },
        metadata: { reason: 'not_a_member' },
      });
      throw new DomainError('INVALID_CREDENTIALS');
    }
    const experience = primaryExperience(membership.roles);
    if (experience === 'hub') {
      // Parents and students use the Family Hub (G-31). The hand-off (C-61) arrives in S8.
      throw new DomainError('FORBIDDEN', 'family hub user', [
        { path: 'experience', issue: 'family_hub' },
      ]);
    }

    await this.context.runAsUser(user.id, () =>
      this.db.$transaction(async (tx) => {
        await tx.userCredential.update({
          where: { userId: user.id },
          data: { failedCount: 0, lockedUntil: null },
        });
        await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      }),
    );
    await this.rate.reset(RATE_RULES.login, ip, identifier?.value ?? input.identifier);
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
    const hostAudience: Audience | undefined =
      resolved?.kind === 'tenant'
        ? 'TENANT'
        : resolved?.kind === 'hub'
          ? 'HUB'
          : resolved?.kind === 'console'
            ? 'CONSOLE'
            : undefined;
    if (audience !== hostAudience) throw new DomainError('UNAUTHENTICATED', 'session audience');
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
    },
  ): Promise<void> {
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
