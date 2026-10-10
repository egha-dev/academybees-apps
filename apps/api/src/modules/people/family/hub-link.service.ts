import { hashToken } from '@academybee/auth';
import {
  type ConsentPurpose,
  LINK_CODE_MAX_ATTEMPTS,
  LINK_CODE_TTL_MS,
  newId,
} from '@academybee/contracts';
import type { TenantBoundClient } from '@academybee/database';
import { tenantHost } from '@academybee/tenant';
import { Inject, Injectable } from '@nestjs/common';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { ClsService } from 'nestjs-cls';

import { AnalyticsService } from '../../../core/analytics/analytics.service.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { API_CONFIG } from '../../../core/config/config.module.js';
import { type ApiConfig, platformRootDomain } from '../../../core/config/config.schema.js';
import type { RequestContext } from '../../../core/context/request-context.js';
import { TENANT_DB } from '../../../core/database/database.module.js';
import { EmailService } from '../../../core/email/email.service.js';
import { DomainError } from '../../../core/errors/domain-error.js';
import { RateLimiter } from '../../../core/rate-limit/rate-limiter.service.js';
import { TenantContext } from '../../../core/tenant/tenant-context.service.js';
import { TenantResolver } from '../../../core/tenant/tenant-resolver.service.js';
import { ParentAccessService } from './parent-access.service.js';

/** Hub linking limits (C-107): per user, per IP, per academy. Keys are hashed. */
const RULES = {
  linkUser: { name: 'link-user', limit: 5, windowSeconds: 3600 },
  /** Code checks per user (each code also allows only 5 tries). */
  verifyUser: { name: 'link-verify-user', limit: 10, windowSeconds: 3600 },
  linkIp: { name: 'link-ip', limit: 20, windowSeconds: 3600 },
  linkTenant: { name: 'link-tenant', limit: 100, windowSeconds: 3600 },
  joinUser: { name: 'join-user', limit: 5, windowSeconds: 86_400 },
} as const;

const OPEN_STATUSES = ['ACTIVE', 'SETUP'] as const;

/**
 * Linking a Family Hub account to an academy (G-31 §3, ADR-039, C-107). Scanning a QR or typing
 * an address never grants access by itself:
 * - **start**: if the academy has a parent record with the user's verified email, a 6-digit code
 *   goes to that email. The answer is always the same, whether the academy exists, knows the
 *   parent or not — nobody can learn who studies where.
 * - **verify**: the code plus the parent's consent (G-06) links the account; the membership
 *   becomes ACTIVE through the consent guard (ParentAccessService).
 * - **join request**: no match → staff decide in the academy's Join requests queue.
 * Every academy read runs inside that academy's own context (tenant-bound client, RLS), never the
 * platform client; link attempts are the user's own rows (RLS on `user_id`).
 */
@Injectable()
export class HubLinkService {
  private readonly root: string;

  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    @Inject(API_CONFIG) config: ApiConfig,
    private readonly cls: ClsService<RequestContext>,
    private readonly context: TenantContext,
    private readonly resolver: TenantResolver,
    private readonly rate: RateLimiter,
    private readonly emails: EmailService,
    private readonly parents: ParentAccessService,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
  ) {
    this.root = platformRootDomain(config);
  }

  async start(slug: string, method: 'QR' | 'URL'): Promise<{ status: 'sent_if_known' }> {
    const userId = this.userId();
    const ip = this.cls.get('ip') ?? 'unknown';
    await this.rate.consume(RULES.linkUser, userId);
    await this.rate.consume(RULES.linkIp, String(ip));
    const tenantId = await this.academy(slug);
    if (tenantId) await this.rate.consume(RULES.linkTenant, tenantId);
    const email = await this.verifiedEmail(userId);
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    if (tenantId)
      await this.context.run(tenantId, async () => {
        const parent = email
          ? await this.db.parent.findFirst({
              where: { email, status: 'ACTIVE' },
              select: { id: true },
            })
          : null;
        const branding = await this.db.tenantBranding.findFirst({
          select: { displayName: true, primaryColor: true },
        });
        await this.db.$transaction(async (tx) => {
          // Always an attempt row (same work either way); a code only for a known parent.
          await tx.academyLinkAttempt.create({
            data: {
              id: newId(),
              userId,
              tenantId,
              method,
              codeHash: parent ? hashToken(code) : null,
              parentId: parent?.id ?? null,
              expiresAt: new Date(Date.now() + LINK_CODE_TTL_MS),
            },
          });
          if (parent && email)
            await this.emails.request(tx, {
              template: 'link_code',
              to: email,
              locale: 'en-IN',
              host: { kind: 'hub' },
              ...(branding
                ? {
                    academy: {
                      displayName: branding.displayName,
                      primaryColor: branding.primaryColor ?? null,
                    },
                  }
                : {}),
              code,
            });
        });
      });
    return { status: 'sent_if_known' };
  }

  async verify(
    slug: string,
    input: { code: string; purposes: ConsentPurpose[] },
  ): Promise<{ linked: true; children: number }> {
    const userId = this.userId();
    await this.rate.consume(RULES.verifyUser, userId);
    const tenantId = await this.academy(slug);
    const invalid = () =>
      new DomainError('VALIDATION_FAILED', 'invalid code', [
        { path: 'code', issue: 'invalid_code' },
      ]);
    if (!tenantId) throw invalid();
    return this.context.run(tenantId, async () => {
      const attempt = await this.db.academyLinkAttempt.findFirst({
        where: { userId, tenantId, usedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });
      if (!attempt || attempt.attempts >= LINK_CODE_MAX_ATTEMPTS) throw invalid();
      await this.db.academyLinkAttempt.update({
        where: { id: attempt.id },
        data: { attempts: { increment: 1 } },
      });
      const given = Buffer.from(hashToken(input.code));
      if (
        !attempt.codeHash ||
        !attempt.parentId ||
        !timingSafeEqual(given, Buffer.from(attempt.codeHash))
      )
        throw invalid();
      const parentId = attempt.parentId;
      const children = await this.db.$transaction(async (tx) => {
        const parent = await tx.parent.findFirst({
          where: { id: parentId, status: 'ACTIVE' },
          select: { userId: true },
        });
        // Already someone else's: never re-point a parent record to another account.
        if (!parent || (parent.userId && parent.userId !== userId)) throw invalid();
        await tx.parent.update({ where: { id: parentId }, data: { userId } });
        const count = await this.parents.recordHubConsent(tx, {
          tenantId,
          parentId,
          purposes: input.purposes,
        });
        await this.parents.activate(tx, { tenantId, userId, parentId });
        await tx.academyLinkAttempt.update({
          where: { id: attempt.id },
          data: { usedAt: new Date() },
        });
        await this.audit.record(
          {
            action: 'parent.hub_linked',
            entityType: 'Parent',
            entityId: parentId,
            actor: { type: 'USER', id: userId },
            metadata: { method: attempt.method },
          },
          tx,
        );
        await this.analytics.track(tx, 'parent.hub_linked', {
          method: attempt.method as 'QR' | 'URL',
        });
        return count;
      });
      return { linked: true as const, children };
    });
  }

  async joinRequest(
    slug: string,
    input: {
      parentName: string;
      phone?: string | undefined;
      childName: string;
      message?: string | undefined;
    },
  ): Promise<{ status: 'received' }> {
    const userId = this.userId();
    await this.rate.consume(RULES.joinUser, userId);
    const tenantId = await this.academy(slug);
    if (!tenantId) return { status: 'received' };
    const email = await this.verifiedEmail(userId);
    await this.context.run(tenantId, async () => {
      await this.db.$transaction(async (tx) => {
        // One open request per person and academy: a new one replaces the details.
        const open = await tx.joinRequest.findFirst({
          where: { userId, status: 'PENDING' },
          select: { id: true },
        });
        const data = {
          parentName: input.parentName,
          phone: input.phone ?? null,
          email,
          childName: input.childName,
          message: input.message ?? null,
        };
        if (open) await tx.joinRequest.update({ where: { id: open.id }, data });
        else {
          await tx.joinRequest.create({ data: { id: newId(), tenantId, userId, ...data } });
          await this.analytics.track(tx, 'family.join_requested', {});
        }
      });
    });
    return { status: 'received' };
  }

  /** The academy for a slug, if it exists and is open; null otherwise (never an error). */
  private async academy(slug: string): Promise<string | null> {
    const normalized = slug.trim().toLowerCase();
    if (!/^[a-z0-9-]{3,42}$/.test(normalized)) return null;
    const resolved = await this.resolver.resolve(tenantHost(normalized, this.root));
    if (resolved.kind !== 'tenant' || !resolved.tenant) return null;
    return (OPEN_STATUSES as readonly string[]).includes(resolved.tenant.status)
      ? resolved.tenant.id
      : null;
  }

  /** The signed-in user's email, only once verified (codes go only to proven addresses). */
  private async verifiedEmail(userId: string): Promise<string | null> {
    const user = await this.context.runAsUser(userId, () =>
      this.db.user.findFirst({
        where: { id: userId },
        select: { email: true, emailVerifiedAt: true },
      }),
    );
    return user?.email && user.emailVerifiedAt ? user.email : null;
  }

  private userId(): string {
    const id = this.cls.get('userId');
    if (!id) throw new DomainError('UNAUTHENTICATED');
    return id;
  }
}
