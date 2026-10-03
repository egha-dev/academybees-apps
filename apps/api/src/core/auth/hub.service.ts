import { generateToken, hashToken } from '@academybee/auth';
import { type RoleKey, ROLE_TEMPLATES } from '@academybee/contracts';
import { type TenantBoundClient } from '@academybee/database';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { type Response } from 'express';
import { type Redis } from 'ioredis';
import { z } from 'zod';

import { AuditService } from '../audit/audit.service.js';
import { TENANT_DB } from '../database/database.module.js';
import { DomainError } from '../errors/domain-error.js';
import { RATE_RULES, RateLimiter } from '../rate-limit/rate-limiter.service.js';
import { REDIS } from '../redis/redis.module.js';
import { DEFAULT_TENANT_STATUSES } from '../tenant/host-policy.js';
import { TenantContext } from '../tenant/tenant-context.service.js';
import { MembershipService } from './membership.service.js';
import { SessionService } from './session.service.js';

/** A handoff code works once, within this many seconds (C-61). */
const HANDOFF_TTL_SECONDS = 60;
const HANDOFF_KEY = (hash: string) => `auth:handoff:${hash}`;
const Handoff = z.object({ userId: z.uuid(), tenantId: z.uuid() });

export type HubAcademy = { tenantId: string; slug: string; name: string; roles: RoleKey[] };

/**
 * The Family Hub side of authentication (G-31, ADR-039, C-61).
 * - Handoff: a parent/student who signs in on an academy host gets a 256-bit code, stored only as
 *   a hash in Redis for 60 s and bound to the user and that academy; `app.` exchanges it once for
 *   a HUB session. No cookie crosses hosts.
 * - Academies: the user's own memberships are listed with no academy context (RLS
 *   `own_memberships`), then each academy is read inside its own tenant context with the
 *   tenant-bound client — never the platform client — and only ACTIVE parent/student memberships
 *   of open academies are returned.
 */
@Injectable()
export class HubService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly context: TenantContext,
    private readonly memberships: MembershipService,
    @Inject(forwardRef(() => SessionService)) private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly rate: RateLimiter,
  ) {}

  async issueHandoff(userId: string, tenantId: string): Promise<string> {
    const code = generateToken();
    await this.redis.set(
      HANDOFF_KEY(hashToken(code)),
      JSON.stringify({ userId, tenantId }),
      'EX',
      HANDOFF_TTL_SECONDS,
    );
    await this.audit.record({
      action: 'auth.handoff_issued',
      actor: { type: 'USER', id: userId },
      entityType: 'User',
      entityId: userId,
    });
    return code;
  }

  /** Exchange a handoff code on `app.` for a HUB session; unknown, used and expired look alike. */
  async exchangeHandoff(code: string, ip: string, res: Response) {
    await this.rate.consume(RATE_RULES.tokenAttempts, ip);
    const raw = await this.redis.getdel(HANDOFF_KEY(hashToken(code)));
    const parsed = raw ? Handoff.safeParse(JSON.parse(raw)) : undefined;
    if (!parsed?.success) throw new DomainError('UNAUTHENTICATED', 'handoff code not valid');
    const { userId, tenantId } = parsed.data;

    // Re-check: the user and the family membership must still be active right now.
    const user = await this.context.runAsUser(userId, () =>
      this.db.user.findFirst({ where: { id: userId }, select: { name: true, status: true } }),
    );
    const academy = (await this.academies(userId)).find((a) => a.tenantId === tenantId);
    if (user?.status !== 'ACTIVE' || !academy)
      throw new DomainError('UNAUTHENTICATED', 'handoff user no longer active');
    return this.sessions.signInToHub(res, { id: userId, name: user.name }, 'handoff');
  }

  /** The academies where the user is an ACTIVE parent or student (per-tenant fan-out, ADR-039). */
  async academies(userId: string): Promise<HubAcademy[]> {
    const own = await this.context.run(undefined, () =>
      this.context.runAsUser(userId, () => this.db.$listOwnMemberships()),
    );
    const found = await Promise.all(
      own.map(({ tenantId }) =>
        this.context.run(tenantId, async (): Promise<HubAcademy | null> => {
          const tenant = await this.db.tenant.findFirst({
            select: {
              slug: true,
              name: true,
              status: true,
              branding: { select: { displayName: true } },
            },
          });
          if (!tenant || !DEFAULT_TENANT_STATUSES.includes(tenant.status)) return null;
          const membership = await this.memberships.load(tenantId, userId);
          if (membership?.status !== 'ACTIVE') return null;
          const roles = membership.roles.filter((r) => ROLE_TEMPLATES[r].experience === 'hub');
          if (!roles.length) return null;
          return {
            tenantId,
            slug: tenant.slug,
            name: tenant.branding?.displayName ?? tenant.name,
            roles,
          };
        }),
      ),
    );
    return found.filter((a): a is HubAcademy => a !== null);
  }
}
