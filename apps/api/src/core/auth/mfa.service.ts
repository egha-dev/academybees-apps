import {
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
import {
  type MfaEnrolConfirmResponse,
  type MfaEnrolStartResponse,
  type LoginResponse,
  newId,
} from '@academybee/contracts';
import { type TenantBoundClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { type Response } from 'express';
import { type Redis } from 'ioredis';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';

import { AuditService } from '../audit/audit.service.js';
import { type RequestContext } from '../context/request-context.js';
import { TENANT_DB } from '../database/database.module.js';
import { DomainError } from '../errors/domain-error.js';
import { RATE_RULES, RateLimiter } from '../rate-limit/rate-limiter.service.js';
import { REDIS } from '../redis/redis.module.js';
import { TenantContext } from '../tenant/tenant-context.service.js';
import { MASTER_KEYS } from './keys.js';
import { SessionService } from './session.service.js';

/** An MFA token lasts 5 minutes and allows 5 wrong codes (then sign in again). */
const MFA_TTL_SECONDS = 300;
const MFA_MAX_FAILURES = 5;
const MFA_KEY = (hash: string) => `auth:mfa:${hash}`;
const Pending = z.object({
  userId: z.uuid(),
  audience: z.literal('CONSOLE'),
  failures: z.number(),
});
type Pending = z.infer<typeof Pending>;

type Code = { code: string } | { recoveryCode: string };

/**
 * Second factor (G-11; mandatory for platform staff, C-66). A correct password on the console
 * gets an MFA token, not a session. The first time, the user enrols a TOTP app (QR + manual key)
 * and confirms a code; ten recovery codes are shown once and stored hashed. After that every
 * console sign-in needs a TOTP code (never the same time step twice) or an unused recovery code.
 * The secret is envelope-encrypted at rest (ADR-033). S9 reuses this for academy users.
 */
@Injectable()
export class MfaService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(MASTER_KEYS) private readonly keys: MasterKeyRing,
    private readonly cls: ClsService<RequestContext>,
    private readonly context: TenantContext,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly rate: RateLimiter,
  ) {}

  /** After a correct console password: issue the MFA token and say which step comes next. */
  async begin(userId: string): Promise<{ step: 'enrol' | 'verify'; token: string }> {
    const token = generateToken();
    const pending: Pending = { userId, audience: 'CONSOLE', failures: 0 };
    await this.redis.set(MFA_KEY(hashToken(token)), JSON.stringify(pending), 'EX', MFA_TTL_SECONDS);
    const factor = await this.factor(userId);
    return { step: factor?.confirmedAt ? 'verify' : 'enrol', token };
  }

  /** A new TOTP secret for the authenticator app; replaces any unconfirmed one. */
  async enrolStart(token: string): Promise<MfaEnrolStartResponse> {
    const pending = await this.pending(token);
    if ((await this.factor(pending.userId))?.confirmedAt)
      throw new DomainError('CONFLICT', 'already enrolled');
    const user = await this.user(pending.userId);
    const secret = generateTotpSecret();
    const secretEncrypted = encryptSecret(secret, this.keys);
    await this.context.runAsUser(pending.userId, () =>
      this.db.mfaFactor.upsert({
        where: { userId_type: { userId: pending.userId, type: 'TOTP' } },
        create: { id: newId(), userId: pending.userId, type: 'TOTP', secretEncrypted },
        update: { secretEncrypted, confirmedAt: null, lastStep: null },
      }),
    );
    const uri = totpUri(secret, user.email ?? user.phone ?? user.name);
    return { qrSvgDataUrl: await totpQrSvgDataUrl(uri), manualKey: formatManualKey(secret) };
  }

  /** Confirm the first code: the factor becomes active, recovery codes are issued, signed in. */
  async enrolConfirm(token: string, code: string, res: Response): Promise<MfaEnrolConfirmResponse> {
    const pending = await this.pending(token);
    const factor = await this.factor(pending.userId);
    if (!factor || factor.confirmedAt) throw new DomainError('CONFLICT', 'nothing to confirm');
    const result = verifyTotp(decryptSecret(factor.secretEncrypted, this.keys), code);
    if (!result.ok) return this.failed(token, pending, 'enrol');

    const recoveryCodes = generateRecoveryCodes();
    await this.context.runAsUser(pending.userId, () =>
      this.db.$transaction(async (tx) => {
        const confirmed = await tx.mfaFactor.updateMany({
          where: { id: factor.id, confirmedAt: null },
          data: { confirmedAt: new Date(), lastStep: result.step, lastUsedAt: new Date() },
        });
        if (confirmed.count !== 1) throw new DomainError('CONFLICT', 'already confirmed');
        await tx.mfaRecoveryCode.deleteMany({});
        await tx.mfaRecoveryCode.createMany({
          data: recoveryCodes.map((c) => ({
            id: newId(),
            userId: pending.userId,
            codeHash: hashRecoveryCode(c),
          })),
        });
        await this.audit.record(
          {
            action: 'auth.mfa_enrolled',
            tenantId: null,
            actor: { type: 'PLATFORM_STAFF', id: pending.userId },
            entityType: 'User',
            entityId: pending.userId,
          },
          tx,
        );
      }),
    );
    await this.redis.del(MFA_KEY(hashToken(token)));
    const signedIn = await this.sessions.signInToConsole(res, await this.user(pending.userId));
    return { ...signedIn, recoveryCodes };
  }

  /** Second step of a console sign-in: a TOTP code or one unused recovery code. */
  async verify(token: string, input: Code, res: Response): Promise<LoginResponse> {
    const pending = await this.pending(token);
    const factor = await this.factor(pending.userId);
    if (!factor?.confirmedAt) throw new DomainError('CONFLICT', 'not enrolled');
    const ok =
      'code' in input
        ? await this.acceptTotp(pending.userId, factor, input.code)
        : await this.acceptRecoveryCode(pending.userId, input.recoveryCode);
    if (!ok) return this.failed(token, pending, 'recoveryCode' in input ? 'recovery' : 'totp');
    await this.redis.del(MFA_KEY(hashToken(token)));
    return this.sessions.signInToConsole(res, await this.user(pending.userId));
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

  private async acceptRecoveryCode(userId: string, recoveryCode: string): Promise<boolean> {
    const used = await this.context.runAsUser(userId, () =>
      this.db.mfaRecoveryCode.updateMany({
        where: { codeHash: hashRecoveryCode(recoveryCode), usedAt: null },
        data: { usedAt: new Date() },
      }),
    );
    if (used.count !== 1) return false;
    await this.audit.record({
      action: 'auth.mfa_recovery_used',
      tenantId: null,
      actor: { type: 'PLATFORM_STAFF', id: userId },
      entityType: 'User',
      entityId: userId,
    });
    return true;
  }

  /** A wrong code: counted on the token (5, then sign in again) and per user. */
  private async failed(token: string, pending: Pending, kind: string): Promise<never> {
    await this.audit.record({
      action: 'auth.mfa_failed',
      tenantId: null,
      actor: { type: 'PLATFORM_STAFF', id: pending.userId },
      metadata: { kind },
    });
    const key = MFA_KEY(hashToken(token));
    const failures = pending.failures + 1;
    if (failures >= MFA_MAX_FAILURES) await this.redis.del(key);
    else await this.redis.set(key, JSON.stringify({ ...pending, failures }), 'KEEPTTL');
    throw new DomainError('INVALID_CREDENTIALS', 'wrong code');
  }

  private async pending(token: string): Promise<Pending> {
    await this.rate.consume(RATE_RULES.tokenAttempts, this.cls.get('ip') ?? 'unknown');
    const raw = await this.redis.get(MFA_KEY(hashToken(token)));
    const parsed = raw ? Pending.safeParse(JSON.parse(raw)) : undefined;
    // Expired, used up or never issued: start again from the password.
    if (!parsed?.success) throw new DomainError('SESSION_EXPIRED', 'mfa token not valid');
    await this.rate.consume(RATE_RULES.mfa, parsed.data.userId);
    return parsed.data;
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
