import { type PrismaClient, type TransactionClient } from '@academybee/database';
import { createPlatformClient } from '@academybee/database/platform';
import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { API_CONFIG } from '../core/config/config.module.js';
import { type ApiConfig } from '../core/config/config.schema.js';
import { type RequestContext } from '../core/context/request-context.js';
import { DomainError } from '../core/errors/domain-error.js';

/**
 * Provisioning and academy management run across academies, so they use the `ab_platform` client
 * (BYPASSRLS, ADR-005) — only here under src/platform/**, behind CONSOLE sessions and `platform.*`
 * capabilities, and every change writes an audit row. Transactions wait up to a minute: they
 * create an academy with its roles in one go.
 */
const TX = { timeout: 60_000, maxWait: 10_000 } as const;

@Injectable()
export class PlatformDb implements OnApplicationShutdown {
  private readonly client: PrismaClient | undefined;

  constructor(
    @Inject(API_CONFIG) config: ApiConfig,
    private readonly cls: ClsService<RequestContext>,
  ) {
    this.client = config.PLATFORM_DATABASE_URL
      ? createPlatformClient(config.PLATFORM_DATABASE_URL, { maxConnections: 3 })
      : undefined;
  }

  /** The client, or 503 when this deployment has no platform database URL. */
  get db(): PrismaClient {
    if (!this.client) throw new DomainError('SERVICE_UNAVAILABLE', 'PLATFORM_DATABASE_URL not set');
    return this.client;
  }

  /**
   * One platform transaction. When the request holds an idempotency claim (`@Idempotent`), the
   * claim is marked committed inside the same transaction — and fenced: if a retry has taken the
   * claim over, nothing commits (C-82, as the tenant client does).
   */
  async transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
    const claim = this.cls.isActive() ? this.cls.get('idempotencyClaim') : undefined;
    return this.db.$transaction(async (tx) => {
      const result = await fn(tx);
      if (claim) {
        const marked = await tx.$queryRaw<{ id: string }[]>`
          UPDATE idempotency_record SET committed_at = COALESCE(committed_at, now())
           WHERE id = ${claim.id}::uuid AND attempt = ${claim.attempt} AND status = 'IN_PROGRESS'
           RETURNING id`;
        if (marked.length !== 1) throw new DomainError('IDEMPOTENCY_KEY_IN_PROGRESS', 'claim lost');
      }
      return result;
    }, TX);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client?.$disconnect();
  }
}
