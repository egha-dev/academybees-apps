import {
  type Audience,
  decryptSecret,
  encryptSecret,
  formatManualKey,
  generateRecoveryCodes,
  generateToken,
  generateTotpSecret,
  hashRecoveryCode,
  hashToken,
  type MasterKeyRing,
  totpQrSvgDataUrl,
  totpUri,
  verifyTotp,
} from '@academybee/auth';
import { type MfaEnrolStartResponse, newId } from '@academybee/contracts';
import type { TenantBoundClient, TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';

import { AnalyticsService } from '../analytics/analytics.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { Actor, RequestContext } from '../context/request-context.js';
import { TENANT_DB } from '../database/database.module.js';
import { DomainError } from '../errors/domain-error.js';
import { RATE_RULES, RateLimiter } from '../rate-limit/rate-limiter.service.js';
import { REDIS } from '../redis/redis.module.js';
import { TenantContext } from '../tenant/tenant-context.service.js';
import { hostAudience } from './http.js';
import { MASTER_KEYS } from './keys.js';

/** An MFA token lasts 5 minutes and allows 5 wrong codes (then sign in again). */
const MFA_TTL_SECONDS = 300;
const MFA_MAX_FAILURES = 5;
const MFA_KEY = (hash: string) => `auth:mfa:${hash}`;
const Pending = z.object({
  userId: z.uuid(),
  audience: z.enum(['TENANT', 'HUB', 'CONSOLE']),
  /** TENANT tokens: the academy the password was checked in. */
  tenantId: z.uuid().optional(),
  failures: z.number(),
});
export type PendingMfa = z.infer<typeof Pending>;

export type MfaCode = { code: string } | { recoveryCode: string };

/**
 * Second factor (G-11, C-66, C-80). TOTP with ten single-use recovery codes; the secret is
 * envelope-encrypted at rest (ADR-033) and a time step is never accepted twice.
 *
 * - Sign-in: a correct password gets an MFA token (5 minutes, bound to the host's audience and,
 *   on an academy host, to that academy), never a session. `LoginService` starts the session once
 *   this service has accepted a code. Mandatory first-time enrolment (console; academies that
 *   require 2FA for the user's roles) uses the same token.
 * - Signed in (academy host): set up after re-entering the password, new recovery codes, turn off.
 */
@Injectable()
export class MfaService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(MASTER_KEYS) private readonly keys: MasterKeyRing,
    private readonly cls: ClsService<RequestContext>,
    private readonly context: TenantContext,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
    private readonly rate: RateLimiter,
  ) {}

  /** Does the user have a confirmed second factor? */
  async isEnabled(userId: string): Promise<boolean> {
    return Boolean((await this.factor(userId))?.confirmedAt);
  }

  /** After a correct password: issue the MFA token and say which step comes next. */
  async begin(
    userId: string,
    audience: Audience,
    tenantId?: string,
  ): Promise<{ step: 'enrol' | 'verify'; token: string }> {
    const token = generateToken();
    const pending: PendingMfa = {
      userId,
      audience,
      ...(audience === 'TENANT' ? { tenantId } : {}),
      failures: 0,
    };
    await this.redis.set(MFA_KEY(hashToken(token)), JSON.stringify(pending), 'EX', MFA_TTL_SECONDS);
    return { step: (await this.isEnabled(userId)) ? 'verify' : 'enrol', token };
  }

  /** Mandatory enrolment: a new TOTP secret for the authenticator app. */
  async enrolStart(token: string): Promise<MfaEnrolStartResponse> {
    const pending = await this.pending(token);
    return this.newSecret(pending.userId);
  }

  /** Mandatory enrolment: confirm the first code. The caller then signs the user in. */
  async enrolConfirm(
    token: string,
    code: string,
  ): Promise<{ pending: PendingMfa; recoveryCodes: string[] }> {
    const pending = await this.pending(token);
    const recoveryCodes = await this.confirm(
      pending.userId,
      code,
      this.actorFor(pending),
      true,
      () => this.failed(token, pending, 'enrol'),
    );
    await this.redis.del(MFA_KEY(hashToken(token)));
    return { pending, recoveryCodes };
  }

  /** Sign-in second step: a TOTP code or one unused recovery code. The caller signs in. */
  async verify(token: string, input: MfaCode): Promise<PendingMfa> {
    const pending = await this.pending(token);
    const factor = await this.factor(pending.userId);
    if (!factor?.confirmedAt) throw new DomainError('CONFLICT', 'not enrolled');
    const ok =
      'code' in input
        ? await this.acceptTotp(pending.userId, factor, input.code)
        : await this.acceptRecoveryCode(pending.userId, input.recoveryCode, this.actorFor(pending));
    if (!ok) return this.failed(token, pending, 'recoveryCode' in input ? 'recovery' : 'totp');
    await this.redis.del(MFA_KEY(hashToken(token)));
    return pending;
  }

  /** Signed in: start setting up 2FA (the password was re-checked by the caller). */
  async setupStart(userId: string): Promise<MfaEnrolStartResponse> {
    await this.rate.consume(RATE_RULES.mfa, userId);
    return this.newSecret(userId);
  }

  /** Signed in: confirm the first code; 2FA is on and this session counts as verified. */
  async setupConfirm(userId: string, sessionId: string, code: string): Promise<string[]> {
    await this.rate.consume(RATE_RULES.mfa, userId);
    const actor: Actor = { type: 'USER', id: userId };
    const codes = await this.confirm(userId, code, actor, false, async () => {
      await this.audit.record({ action: 'auth.mfa_failed', actor, metadata: { kind: 'setup' } });
      throw new DomainError('INVALID_CREDENTIALS', 'wrong code');
    });
    await this.context.runAsUser(userId, () =>
      this.db.authSession.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { mfaVerifiedAt: new Date() },
      }),
    );
    return codes;
  }

  /** Signed in: replace every recovery code (the password was re-checked by the caller). */
  async regenerateRecoveryCodes(userId: string): Promise<string[]> {
    if (!(await this.isEnabled(userId))) throw new DomainError('CONFLICT', 'not enrolled');
    const codes = generateRecoveryCodes();
    await this.context.runAsUser(userId, () =>
      this.db.$transaction(async (tx) => {
        await this.replaceRecoveryCodes(tx, userId, codes);
        await this.audit.record(
          {
            action: 'auth.mfa_recovery_regenerated',
            actor: { type: 'USER', id: userId },
            entityType: 'User',
            entityId: userId,
          },
          tx,
        );
      }),
    );
    return codes;
  }

  /**
   * Signed in: turn 2FA off (the caller re-checked the password and the academy rule). `inTx`
   * runs in the same transaction, for the alert email.
   */
  async disable(userId: string, inTx: (tx: TransactionClient) => Promise<void>): Promise<void> {
    await this.context.runAsUser(userId, () =>
      this.db.$transaction(async (tx) => {
        const removed = await tx.mfaFactor.deleteMany({});
        if (removed.count === 0) throw new DomainError('CONFLICT', 'not enrolled');
        await tx.mfaRecoveryCode.deleteMany({});
        await this.audit.record(
          {
            action: 'auth.mfa_disabled',
            actor: { type: 'USER', id: userId },
            entityType: 'User',
            entityId: userId,
          },
          tx,
        );
        await inTx(tx);
      }),
    );
  }

  /** 2FA state for the Security page. */
  async status(
    userId: string,
  ): Promise<{ enabled: boolean; enabledAt: Date | null; recoveryCodesLeft: number }> {
    const factor = await this.factor(userId);
    if (!factor?.confirmedAt) return { enabled: false, enabledAt: null, recoveryCodesLeft: 0 };
    const recoveryCodesLeft = await this.context.runAsUser(userId, () =>
      this.db.mfaRecoveryCode.count({ where: { usedAt: null } }),
    );
    return { enabled: true, enabledAt: factor.confirmedAt, recoveryCodesLeft };
  }

  /** A new secret; replaces any unconfirmed one. */
  private async newSecret(userId: string): Promise<MfaEnrolStartResponse> {
    if (await this.isEnabled(userId)) throw new DomainError('CONFLICT', 'already enrolled');
    const user = await this.user(userId);
    const secret = generateTotpSecret();
    const secretEncrypted = encryptSecret(secret, this.keys);
    await this.context.runAsUser(userId, () =>
      this.db.mfaFactor.upsert({
        where: { userId_type: { userId, type: 'TOTP' } },
        create: { id: newId(), userId, type: 'TOTP', secretEncrypted },
        update: { secretEncrypted, confirmedAt: null, lastStep: null },
      }),
    );
    const uri = totpUri(secret, user.email ?? user.phone ?? user.name);
    return { qrSvgDataUrl: await totpQrSvgDataUrl(uri), manualKey: formatManualKey(secret) };
  }

  /** Confirm the pending factor with its first code and issue the recovery codes. */
  private async confirm(
    userId: string,
    code: string,
    actor: Actor,
    required: boolean,
    onWrongCode: () => Promise<never>,
  ): Promise<string[]> {
    const factor = await this.factor(userId);
    if (!factor || factor.confirmedAt) throw new DomainError('CONFLICT', 'nothing to confirm');
    const result = verifyTotp(decryptSecret(factor.secretEncrypted, this.keys), code);
    if (!result.ok) return onWrongCode();

    const recoveryCodes = generateRecoveryCodes();
    await this.context.runAsUser(userId, () =>
      this.db.$transaction(async (tx) => {
        const confirmed = await tx.mfaFactor.updateMany({
          where: { id: factor.id, confirmedAt: null },
          data: { confirmedAt: new Date(), lastStep: result.step, lastUsedAt: new Date() },
        });
        if (confirmed.count !== 1) throw new DomainError('CONFLICT', 'already confirmed');
        await this.replaceRecoveryCodes(tx, userId, recoveryCodes);
        await this.audit.record(
          {
            action: 'auth.mfa_enrolled',
            ...this.auditTenant(),
            actor,
            entityType: 'User',
            entityId: userId,
          },
          tx,
        );
        if (this.cls.get('resolvedHost')?.kind === 'tenant')
          await this.analytics.track(tx, 'auth.mfa_enabled', { required });
      }),
    );
    return recoveryCodes;
  }

  private async replaceRecoveryCodes(
    tx: TransactionClient,
    userId: string,
    codes: readonly string[],
  ): Promise<void> {
    await tx.mfaRecoveryCode.deleteMany({});
    await tx.mfaRecoveryCode.createMany({
      data: codes.map((c) => ({ id: newId(), userId, codeHash: hashRecoveryCode(c) })),
    });
  }

  private async acceptTotp(
    userId: string,
    factor: { id: string; secretEncrypted: string; lastStep: bigint | null },
    code: string,
  ): Promise<boolean> {
    const result = verifyTotp(decryptSecret(factor.secretEncrypted, this.keys), code, {
      lastStep: factor.lastStep === null ? null : Number(factor.lastStep),
    });
    if (!result.ok) return false;
    // Claim the step atomically: two requests with the same code can't both succeed.
    const claimed = await this.context.runAsUser(userId, () =>
      this.db.mfaFactor.updateMany({
        where: {
          id: factor.id,
          OR: [{ lastStep: null }, { lastStep: { lt: BigInt(result.step) } }],
        },
        data: { lastStep: BigInt(result.step), lastUsedAt: new Date() },
      }),
    );
    return claimed.count === 1;
  }

  private async acceptRecoveryCode(
    userId: string,
    recoveryCode: string,
    actor: Actor,
  ): Promise<boolean> {
    const used = await this.context.runAsUser(userId, () =>
      this.db.mfaRecoveryCode.updateMany({
        where: { codeHash: hashRecoveryCode(recoveryCode), usedAt: null },
        data: { usedAt: new Date() },
      }),
    );
    if (used.count !== 1) return false;
    await this.audit.record({
      action: 'auth.mfa_recovery_used',
      ...this.auditTenant(),
      actor,
      entityType: 'User',
      entityId: userId,
    });
    return true;
  }

  /** A wrong code: counted on the token (5, then sign in again) and per user. */
  private async failed(token: string, pending: PendingMfa, kind: string): Promise<never> {
    await this.audit.record({
      action: 'auth.mfa_failed',
      ...this.auditTenant(),
      actor: this.actorFor(pending),
      metadata: { kind },
    });
    const key = MFA_KEY(hashToken(token));
    const failures = pending.failures + 1;
    if (failures >= MFA_MAX_FAILURES) await this.redis.del(key);
    else await this.redis.set(key, JSON.stringify({ ...pending, failures }), 'KEEPTTL');
    throw new DomainError('INVALID_CREDENTIALS', 'wrong code');
  }

  private async pending(token: string): Promise<PendingMfa> {
    await this.rate.consume(RATE_RULES.tokenAttempts, this.cls.get('ip') ?? 'unknown');
    const raw = await this.redis.get(MFA_KEY(hashToken(token)));
    const parsed = raw ? Pending.safeParse(JSON.parse(raw)) : undefined;
    // Expired, used up or never issued: start again from the password.
    if (!parsed?.success) throw new DomainError('SESSION_EXPIRED', 'mfa token not valid');
    // Only on the host (and academy) where the password was checked (C-80).
    const resolved = this.cls.get('resolvedHost');
    const sameAcademy =
      parsed.data.audience !== 'TENANT' ||
      (resolved?.kind === 'tenant' && resolved.tenant.id === parsed.data.tenantId);
    if (hostAudience(resolved) !== parsed.data.audience || !sameAcademy)
      throw new DomainError('NOT_FOUND', 'mfa token from another host');
    await this.rate.consume(RATE_RULES.mfa, parsed.data.userId);
    return parsed.data;
  }

  private actorFor(pending: PendingMfa): Actor {
    return pending.audience === 'CONSOLE'
      ? { type: 'PLATFORM_STAFF', id: pending.userId }
      : { type: 'USER', id: pending.userId };
  }

  /** Academy host: the academy's audit trail; console and hub: the platform trail. */
  private auditTenant(): { tenantId?: null } {
    return this.cls.get('resolvedHost')?.kind === 'tenant' ? {} : { tenantId: null };
  }

  private factor(userId: string) {
    return this.context.runAsUser(userId, () =>
      this.db.mfaFactor.findFirst({
        where: { type: 'TOTP' },
        select: { id: true, secretEncrypted: true, confirmedAt: true, lastStep: true },
      }),
    );
  }

  private async user(userId: string) {
    const user = await this.context.runAsUser(userId, () =>
      this.db.user.findFirst({
        where: { id: userId },
        select: { id: true, name: true, email: true, phone: true, status: true },
      }),
    );
    if (user?.status !== 'ACTIVE') throw new DomainError('UNAUTHENTICATED', 'user not active');
    return user;
  }
}
