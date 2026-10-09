import { classifyHost, normalizeRootDomain, tenantHost } from '@academybee/tenant';
import type { TenantBoundClient } from '@academybee/database';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { API_CONFIG } from '../config/config.module.js';
import { type ApiConfig, platformRootDomain } from '../config/config.schema.js';
import type { ResolvedHost } from '../context/request-context.js';
import { TENANT_DB } from '../database/database.module.js';
import { REDIS } from '../redis/redis.module.js';
import { TenantContext } from './tenant-context.service.js';

const KEY = (lookupKey: string) => `tenant:host:${lookupKey}`;
const TENANT_KEYS = (tenantId: string) => `tenant:hosts:${tenantId}`;
const MISS = 'none';

/**
 * Request host → academy (ARCHITECTURE §5.2). The host is candidate identification only;
 * authorization comes from the authenticated membership (Phase 2, PRD v3.1 §C).
 * Lookups are cached in Redis (hit TTL TENANT_CACHE_MS, unknown-host TTL TENANT_NEGATIVE_CACHE_MS);
 * Redis being down never fails a request — it falls back to the database.
 */
@Injectable()
export class TenantResolver {
  private readonly logger = new Logger(TenantResolver.name);
  private readonly root: string;

  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly context: TenantContext,
  ) {
    this.root = normalizeRootDomain(platformRootDomain(config));
  }

  async resolve(host: string | undefined): Promise<ResolvedHost> {
    const hostClass = classifyHost(host, this.root);
    if (hostClass.kind !== 'tenant' && hostClass.kind !== 'custom') return { kind: hostClass.kind };
    if (hostClass.kind === 'custom' && !this.config.CUSTOM_DOMAINS_ENABLED)
      return { kind: 'unknown' };
    const cached = await this.cacheGet(hostClass.lookupKey);
    if (cached) return cached;
    const resolved = await this.lookup(hostClass.lookupKey, hostClass.kind === 'custom');
    await this.cacheSet(hostClass.lookupKey, resolved);
    return resolved;
  }

  /** Drop cached resolutions for a host (slug/domain changes, Phase 3 console). */
  async invalidateHost(lookupKey: string): Promise<void> {
    await this.safe(() => this.redis.del(KEY(lookupKey)));
  }

  /** Drop every cached host of an academy (status changes: suspend, archive, activate). */
  async invalidateTenant(tenantId: string): Promise<void> {
    await this.safe(async () => {
      const keys = await this.redis.smembers(TENANT_KEYS(tenantId));
      if (keys.length) await this.redis.del(...keys.map(KEY));
      await this.redis.del(TENANT_KEYS(tenantId));
    });
  }

  private async lookup(lookupKey: string, custom: boolean): Promise<ResolvedHost> {
    // Host lookup runs outside any tenant context (C-51), whatever the caller's context is.
    const row = await this.context.run(undefined, () => this.db.$lookupTenantDomain(lookupKey));
    // Unverified custom domains never resolve (PRD v3.1 §G).
    if (!row || (custom && row.verification !== 'VERIFIED')) return { kind: 'unknown' };
    if (row.role === 'REDIRECT') {
      const primary = await this.context.run(row.tenantId, () =>
        this.db.tenantDomain.findFirst({
          where: { role: 'PRIMARY' },
          select: { hostname: true, kind: true, verification: true },
        }),
      );
      // Never send visitors to a custom domain nobody has proven they own (C-96, review P1-4 L1).
      if (!primary || (primary.kind === 'CUSTOM' && primary.verification !== 'VERIFIED'))
        return { kind: 'unknown' };
      const host =
        primary.kind === 'SUBDOMAIN' ? tenantHost(primary.hostname, this.root) : primary.hostname;
      return { kind: 'redirect', tenantId: row.tenantId, host };
    }
    return { kind: 'tenant', tenant: row.tenant, domainRole: row.role };
  }

  private async cacheGet(lookupKey: string): Promise<ResolvedHost | undefined> {
    const raw = await this.safe(() => this.redis.get(KEY(lookupKey)));
    if (!raw) return undefined;
    if (raw === MISS) return { kind: 'unknown' };
    try {
      return JSON.parse(raw) as ResolvedHost;
    } catch {
      return undefined;
    }
  }

  private async cacheSet(lookupKey: string, resolved: ResolvedHost): Promise<void> {
    const unknown = resolved.kind === 'unknown';
    const ttl = unknown ? this.config.TENANT_NEGATIVE_CACHE_MS : this.config.TENANT_CACHE_MS;
    if (ttl === 0) return;
    await this.safe(async () => {
      await this.redis.set(KEY(lookupKey), unknown ? MISS : JSON.stringify(resolved), 'PX', ttl);
      const tenantId =
        resolved.kind === 'tenant'
          ? resolved.tenant.id
          : resolved.kind === 'redirect'
            ? resolved.tenantId
            : undefined;
      if (tenantId) await this.redis.sadd(TENANT_KEYS(tenantId), lookupKey);
    });
  }

  private async safe<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn();
    } catch (error) {
      this.logger.warn({ err: error }, 'Tenant cache unavailable; using the database');
      return undefined;
    }
  }
}
