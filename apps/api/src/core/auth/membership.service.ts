import { type Capability, isCapability, mergeGrants, RoleKeySchema } from '@academybee/contracts';
import { type TenantBoundClient } from '@academybee/database';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Redis } from 'ioredis';

import { type MembershipInfo } from '../context/request-context.js';
import { TENANT_DB } from '../database/database.module.js';
import { REDIS } from '../redis/redis.module.js';
import { TenantContext } from '../tenant/tenant-context.service.js';

const KEY = (tenantId: string, userId: string) => `auth:mem:${tenantId}:${userId}`;
const TTL_SECONDS = 60;

/**
 * A user's membership in the current academy with roles and resolved capabilities (ADR-008).
 * Cached in Redis for a minute; every role/status change bumps `permissionsVersion` and calls
 * `invalidate`, so changes apply on the next request (ARCHITECTURE §6.2).
 */
@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);

  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly context: TenantContext,
  ) {}

  /** Must run inside the academy's context (the TenantGuard sets it for requests). */
  async load(tenantId: string, userId: string): Promise<MembershipInfo | null> {
    const cached = await this.redis.get(KEY(tenantId, userId)).catch(() => null);
    if (cached) {
      try {
        return JSON.parse(cached) as MembershipInfo;
      } catch {
        // fall through to the database
      }
    }
    const row = await this.context.runAsUser(userId, () =>
      this.db.membership.findFirst({
        where: { userId },
        select: {
          id: true,
          status: true,
          permissionsVersion: true,
          branchIds: true,
          roles: {
            select: {
              role: {
                select: { key: true, permissions: { select: { capability: true, scope: true } } },
              },
            },
          },
        },
      }),
    );
    if (!row) return null;
    const roles = row.roles
      .map((r) => RoleKeySchema.safeParse(r.role.key))
      .filter((r) => r.success)
      .map((r) => r.data);
    const grants = row.roles.flatMap((r) =>
      r.role.permissions
        .filter((p) => isCapability(p.capability))
        .map((p) => ({ capability: p.capability as Capability, scope: p.scope })),
    );
    const info: MembershipInfo = {
      id: row.id,
      status: row.status,
      permissionsVersion: row.permissionsVersion,
      branchIds: row.branchIds,
      roles,
      capabilities: mergeGrants(grants),
    };
    await this.redis
      .set(KEY(tenantId, userId), JSON.stringify(info), 'EX', TTL_SECONDS)
      .catch((error: unknown) => this.logger.warn({ err: error }, 'membership cache unavailable'));
    return info;
  }

  async invalidate(tenantId: string, userId: string): Promise<void> {
    await this.redis.del(KEY(tenantId, userId)).catch(() => undefined);
  }
}
