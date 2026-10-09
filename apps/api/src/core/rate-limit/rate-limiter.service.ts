import { hashToken } from '@academybee/auth';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { DomainError } from '../errors/domain-error.js';
import { REDIS } from '../redis/redis.module.js';

export type RateRule = { name: string; limit: number; windowSeconds: number };

/** Rules from ARCHITECTURE §6.2 (C-63). Keys hold hashes, never identifiers or IPs in clear. */
export const RATE_RULES = {
  /** Sign-in attempts per IP + identifier. */
  login: { name: 'login', limit: 5, windowSeconds: 60 },
  /** Sign-in attempts per IP, any identifier (credential stuffing). */
  loginIp: { name: 'login-ip', limit: 30, windowSeconds: 60 },
  /** Reset and invite emails per identifier. */
  resetOrInvite: { name: 'reset-invite', limit: 3, windowSeconds: 3600 },
  /** Invitations sent per inviting member. */
  invitesPerMember: { name: 'invites-member', limit: 50, windowSeconds: 3600 },
  /** Link-token checks (invite preview/accept, password reset) per IP: no token guessing. */
  tokenAttempts: { name: 'token', limit: 20, windowSeconds: 60 },
  /** Second-factor attempts per user, across MFA tokens (C-66). */
  mfa: { name: 'mfa', limit: 10, windowSeconds: 300 },
  /** Live subdomain checks per console user while typing (C-88). */
  slugCheck: { name: 'slug-check', limit: 120, windowSeconds: 60 },
} as const satisfies Record<string, RateRule>;

/**
 * Fixed-window Redis counters. Redis down → allow (logged): rate limiting is a defence layer,
 * and failing closed would lock every academy out of sign-in.
 */
@Injectable()
export class RateLimiter {
  private readonly logger = new Logger(RateLimiter.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Count one hit; throws 429 RATE_LIMITED with Retry-After when over the limit. */
  async consume(rule: RateRule, ...parts: string[]): Promise<void> {
    const key = `rl:${rule.name}:${hashToken(parts.join('|'))}`;
    try {
      const results = await this.redis
        .multi()
        .incr(key)
        .expire(key, rule.windowSeconds, 'NX')
        .ttl(key)
        .exec();
      const count = Number(results?.[0]?.[1] ?? 0);
      const ttl = Number(results?.[2]?.[1] ?? rule.windowSeconds);
      if (count > rule.limit)
        throw new DomainError(
          'RATE_LIMITED',
          `${rule.name} limit`,
          undefined,
          ttl > 0 ? ttl : rule.windowSeconds,
        );
    } catch (error) {
      if (error instanceof DomainError) throw error;
      this.logger.warn({ err: error }, 'Rate limiter unavailable; allowing the request');
    }
  }

  /** Clear a counter after success (e.g. a correct password resets the per-identifier window). */
  async reset(rule: RateRule, ...parts: string[]): Promise<void> {
    await this.redis.del(`rl:${rule.name}:${hashToken(parts.join('|'))}`).catch(() => undefined);
  }
}
