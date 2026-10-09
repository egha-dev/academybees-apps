import {
  type Audience,
  generateCsrfToken,
  generateToken,
  hashToken,
  type KeyRing,
  signAccessToken,
} from '@academybee/auth';
import {
  newId,
  primaryExperience,
  type ExperienceName,
  type LoginResponse,
  type RoleKey,
} from '@academybee/contracts';
import { type TenantBoundClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { type Response } from 'express';
import { type Redis } from 'ioredis';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';

import { AuditService } from '../audit/audit.service.js';
import { API_CONFIG } from '../config/config.module.js';
import { type ApiConfig } from '../config/config.schema.js';
import { type RequestContext } from '../context/request-context.js';
import { TENANT_DB } from '../database/database.module.js';
import { DomainError } from '../errors/domain-error.js';
import { REDIS } from '../redis/redis.module.js';
import { TenantContext } from '../tenant/tenant-context.service.js';
import {
  clearSessionCookies,
  deviceLabel,
  hostAudience,
  REFRESH_TTL_MS,
  setSessionCookies,
} from './http.js';
import { DeviceService } from './device.service.js';
import { AUTH_KEYS } from './keys.js';
import { MembershipService } from './membership.service.js';
import { MfaPolicyService } from './mfa-policy.service.js';

const DAY = 24 * 3600 * 1000;
/** Lock after this many consecutive failures; the lock doubles per further failure (≤ 60 min). */
const LOCK_AFTER = 5;
/** A rotated refresh token presented again within this window is a parallel-tab race, not theft. */
const ROTATION_GRACE_MS = 20_000;
/** Session-validity cache (revocation deletes the key). */
const SESSION_KEY = (sid: string) => `auth:sess:${sid}`;

/** Sessions exist only in academies that are setting up or active (C-86, ARCHITECTURE §5.3). */
export const isAcademyOpen = (status: string) => status === 'SETUP' || status === 'ACTIVE';

/** Drop the session-validity cache of revoked sessions (suspend/archive revoke in bulk). */
export const sessionCacheKey = SESSION_KEY;

/** Where each experience starts (ARCHITECTURE §10.2; homes behind `p2-role-homes` until 5/6). */
export const HOME: Record<ExperienceName, string> = { manage: '/today', teach: '/teach', hub: '/' };
/** Owner/Accountant without 2FA land here after sign-in (the strong prompt, G-11, C-80). */
export const MFA_PROMPT_PATH = '/settings/security?prompt=mfa';

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
    private readonly devices: DeviceService,
    private readonly mfaPolicy: MfaPolicyService,
    private readonly audit: AuditService,
  ) {}

  /** Start a HUB session (sign-in on `app.` or a handoff, C-61). */
  async signInToHub(
    res: Response,
    user: { id: string; name: string },
    via: 'password' | 'handoff',
    mfaVerifiedAt?: Date,
  ): Promise<LoginResponse> {
    await this.startSession(res, { userId: user.id, audience: 'HUB', mfaVerifiedAt });
    await this.audit.record({
      action: 'auth.login',
      tenantId: null,
      actor: { type: 'USER', id: user.id },
      entityType: 'User',
      entityId: user.id,
      metadata: { audience: 'HUB', via, mfa: Boolean(mfaVerifiedAt) },
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

  /** The user's platform staff row (user-bound RLS: only their own, C-59). */
  platformStaff(userId: string) {
    return this.context.runAsUser(userId, () =>
      this.db.platformStaff.findFirst({ select: { platformRole: true, status: true } }),
    );
  }

  /**
   * Start a TENANT session for a verified user who is an ACTIVE member of this academy (sign-in,
   * invitation accept) and say where to go: the role's home, or the 2FA prompt (G-11).
   */
  async signInToAcademy(
    res: Response,
    user: { id: string; name: string },
    tenantId: string,
    roles: readonly RoleKey[],
    options: { mfaVerifiedAt?: Date | undefined; promptMfa?: boolean } = {},
  ): Promise<LoginResponse> {
    this.assertAcademyOpen(tenantId);
    const experience = primaryExperience(roles);
    await this.startSession(res, {
      userId: user.id,
      audience: 'TENANT',
      tenantId,
      mfaVerifiedAt: options.mfaVerifiedAt,
    });
    await this.audit.record({
      action: 'auth.login',
      actor: { type: 'USER', id: user.id },
      entityType: 'User',
      entityId: user.id,
      metadata: { mfa: Boolean(options.mfaVerifiedAt) },
    });
    return {
      user: { name: user.name },
      ...(experience ? { experience } : {}),
      redirectTo: options.promptMfa ? MFA_PROMPT_PATH : experience ? HOME[experience] : '/',
    };
  }

  /**
   * The user's live sessions on this host: in this academy (TENANT) or of this audience. One row
   * per signed-in device (a refresh family); `signedInAt` is when that device signed in.
   */
  async listSessions(): Promise<
    { id: string; device: string; signedInAt: Date; lastUsedAt: Date; current: boolean }[]
  > {
    const { userId, current, where } = this.ownSessionScope();
    const live = await this.context.runAsUser(userId, () =>
      this.db.authSession.findMany({
        where: { ...where, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, familyId: true, deviceLabel: true, lastUsedAt: true, createdAt: true },
        orderBy: { lastUsedAt: 'desc' },
        take: 100,
      }),
    );
    const firsts = live.length
      ? await this.context.runAsUser(userId, () =>
          this.db.authSession.groupBy({
            by: ['familyId'],
            where: { familyId: { in: live.map((s) => s.familyId) } },
            _min: { createdAt: true },
          }),
        )
      : [];
    const started = new Map(firsts.map((f) => [f.familyId, f._min.createdAt]));
    return live.map((s) => ({
      id: s.id,
      device: s.deviceLabel ?? 'other/other',
      signedInAt: started.get(s.familyId) ?? s.createdAt,
      lastUsedAt: s.lastUsedAt,
      current: s.id === current,
    }));
  }

  /** Sign out one of the user's devices on this host (unknown or someone else's → 404). */
  async revokeSession(sessionId: string): Promise<void> {
    const { userId, where } = this.ownSessionScope();
    if (!z.uuid().safeParse(sessionId).success) throw new DomainError('NOT_FOUND');
    const target = await this.context.runAsUser(userId, () =>
      this.db.authSession.findFirst({
        where: { ...where, id: sessionId, revokedAt: null },
        select: { familyId: true },
      }),
    );
    if (!target) throw new DomainError('NOT_FOUND');
    await this.revokeFamily(userId, target.familyId, 'signed_out_remotely');
    await this.audit.record({
      action: 'auth.session_revoked',
      actor: { type: 'USER', id: userId },
      entityType: 'AuthSession',
      entityId: target.familyId,
    });
  }

  /** Sign out every other device on this host; this one stays signed in (G-11). */
  async revokeOtherSessions(): Promise<number> {
    const { userId, current, where } = this.ownSessionScope();
    const others = await this.context.runAsUser(userId, () =>
      this.db.authSession.findMany({
        where: { ...where, revokedAt: null, NOT: { id: current } },
        select: { id: true },
      }),
    );
    if (others.length) {
      await this.context.runAsUser(userId, () =>
        this.db.authSession.updateMany({
          where: { id: { in: others.map((s) => s.id) }, revokedAt: null },
          data: { revokedAt: new Date(), revokeReason: 'logout_others' },
        }),
      );
      await this.redis.del(...others.map((s) => SESSION_KEY(s.id))).catch(() => undefined);
    }
    await this.audit.record({
      action: 'auth.logout_others',
      actor: { type: 'USER', id: userId },
      metadata: { revoked: others.length },
    });
    return others.length;
  }

  /** The signed-in user's sessions that this host may show: same audience, same academy. */
  private ownSessionScope() {
    const userId = this.cls.get('userId');
    const session = this.cls.get('session');
    if (!userId || !session) throw new DomainError('UNAUTHENTICATED');
    const tenantId = this.cls.get('tenantId');
    return {
      userId,
      current: session.id,
      where: {
        audience: session.audience,
        ...(session.audience === 'TENANT' ? { tenantId: tenantId ?? '' } : {}),
      },
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
    except?: { sessionId: string },
  ): Promise<number> {
    const where = {
      revokedAt: null,
      ...(only ? { tenantId: only.tenantId } : {}),
      ...(except ? { NOT: { id: except.sessionId } } : {}),
    };
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
      // A suspended or archived academy ends its sessions (C-86); suspending also revokes them.
      const status = this.cls.get('resolvedHost');
      if (status?.kind === 'tenant' && !isAcademyOpen(status.tenant.status)) {
        await this.revokeFamily(session.userId, session.familyId, 'tenant_unavailable');
        clearSessionCookies(res, this.config.COOKIE_MODE);
        throw new DomainError('TENANT_UNAVAILABLE', 'academy not open');
      }
      const membership = await this.memberships.load(session.tenantId, session.userId);
      if (membership?.status !== 'ACTIVE') {
        await this.revokeFamily(session.userId, session.familyId, 'membership_inactive');
        clearSessionCookies(res, this.config.COOKIE_MODE);
        throw new DomainError('UNAUTHENTICATED', 'membership inactive');
      }
      // The academy now requires 2FA for this member's roles: sign in again with it (C-80).
      if (!session.mfaVerifiedAt && (await this.mfaPolicy.isRequiredFor(membership.roles))) {
        await this.revokeFamily(session.userId, session.familyId, 'mfa_required');
        clearSessionCookies(res, this.config.COOKIE_MODE);
        throw new DomainError('UNAUTHENTICATED', 'mfa required');
      }
    }
    if (session.audience === 'CONSOLE') {
      const staff = await this.platformStaff(session.userId);
      if (staff?.status !== 'ACTIVE' || !session.mfaVerifiedAt) {
        await this.revokeFamily(session.userId, session.familyId, 'staff_inactive');
        clearSessionCookies(res, this.config.COOKIE_MODE);
        throw new DomainError('UNAUTHENTICATED', 'platform staff inactive');
      }
    }

    // Claim the rotation atomically: of two requests presenting the same token at once (two
    // tabs, or a thief racing the owner), only one gets new tokens, so the family never forks
    // and reuse detection still sees the other token later (review M4).
    const rotated = await this.context.runAsUser(session.userId, () =>
      this.db.authSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'rotated' },
      }),
    );
    if (rotated.count !== 1) throw new DomainError('CONFLICT', 'refresh race');
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

  /**
   * Sign out this device, or every device of this audience (and academy) (G-11). The session is
   * the signed-in one, or — when the 15-minute access token has expired — the one the refresh
   * cookie belongs to (it is sent to `/api/v1/auth/*`), so signing out always ends the session on
   * the server, not just in the browser (review M1). Cookies are cleared either way.
   */
  async logout(
    refreshToken: string | undefined,
    everywhere: boolean,
    res: Response,
  ): Promise<void> {
    const current = await this.currentSession(refreshToken);
    if (current) {
      const { userId, audience, tenantId, familyId } = current;
      if (everywhere) {
        const sessions = await this.context.runAsUser(userId, () =>
          this.db.authSession.findMany({
            where: {
              revokedAt: null,
              audience,
              ...(audience === 'TENANT' && tenantId ? { tenantId } : {}),
            },
            select: { id: true },
          }),
        );
        await this.context.runAsUser(userId, () =>
          this.db.authSession.updateMany({
            where: { id: { in: sessions.map((s) => s.id) }, revokedAt: null },
            data: { revokedAt: new Date(), revokeReason: 'logout_all' },
          }),
        );
        if (sessions.length)
          await this.redis.del(...sessions.map((s) => SESSION_KEY(s.id))).catch(() => undefined);
      } else {
        await this.revokeFamily(userId, familyId, 'logout');
      }
      await this.audit.record({
        action: everywhere ? 'auth.logout_all' : 'auth.logout',
        actor: { type: audience === 'CONSOLE' ? 'PLATFORM_STAFF' : 'USER', id: userId },
      });
    }
    clearSessionCookies(res, this.config.COOKIE_MODE);
  }

  /** The session signing out: from the access token, else from the refresh cookie (this host). */
  private async currentSession(
    refreshToken: string | undefined,
  ): Promise<
    { userId: string; audience: Audience; tenantId: string | null; familyId: string } | undefined
  > {
    const userId = this.cls.get('userId');
    const session = this.cls.get('session');
    if (userId && session) {
      const row = await this.context.runAsUser(userId, () =>
        this.db.authSession.findFirst({
          where: { id: session.id },
          select: { audience: true, tenantId: true, familyId: true },
        }),
      );
      return row ? { userId, ...row } : undefined;
    }
    if (!refreshToken) return undefined;
    const hash = hashToken(refreshToken);
    const row = await this.db.$withLookup({ token: hash }, (tx) =>
      tx.authSession.findFirst({
        where: { refreshTokenHash: hash },
        select: { userId: true, audience: true, tenantId: true, familyId: true, revokedAt: true },
      }),
    );
    if (!row || row.revokedAt) return undefined;
    // Only a session of this host (and academy) is signed out here.
    const resolved = this.cls.get('resolvedHost');
    if (row.audience !== hostAudience(resolved)) return undefined;
    if (
      row.audience === 'TENANT' &&
      (resolved?.kind !== 'tenant' || row.tenantId !== resolved.tenant.id)
    )
      return undefined;
    return {
      userId: row.userId,
      audience: row.audience,
      tenantId: row.tenantId,
      familyId: row.familyId,
    };
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

  /** No new academy session unless the academy is setting up or active (C-86). */
  private assertAcademyOpen(tenantId: string): void {
    const resolved = this.cls.get('resolvedHost');
    if (
      resolved?.kind === 'tenant' &&
      resolved.tenant.id === tenantId &&
      !isAcademyOpen(resolved.tenant.status)
    )
      throw new DomainError('TENANT_UNAVAILABLE', 'academy not open');
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
    // A new sign-in (not a refresh): remember the device, alert on a new one (G-11).
    if (!input.familyId) await this.devices.signedIn(res, input.userId);
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
