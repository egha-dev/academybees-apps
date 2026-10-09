import {
  type AcademyDetail,
  type AcademySummary,
  decodeCursor,
  encodeCursor,
  newId,
  nextTenantStatus,
  ONBOARDING_STEPS,
  type TenantStatus,
  type TenantTransition,
} from '@academybee/contracts';
import type { Prisma } from '@academybee/database';
import { normalizeRootDomain, tenantHost } from '@academybee/tenant';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { z } from 'zod';

import { AnalyticsService } from '../../core/analytics/analytics.service.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { sessionCacheKey } from '../../core/auth/session.service.js';
import { API_CONFIG } from '../../core/config/config.module.js';
import { type ApiConfig, platformRootDomain } from '../../core/config/config.schema.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { REDIS } from '../../core/redis/redis.module.js';
import { TenantResolver } from '../../core/tenant/tenant-resolver.service.js';
import { PlatformDb } from '../platform-db.js';
import { OwnerInviteService } from './owner-invite.service.js';
import { SlugAvailabilityService } from './slug-availability.service.js';

const CursorKeys = z.object({ c: z.iso.datetime(), id: z.uuid() });
/** Onboarding steps that count towards progress (Ready is the finish line, not a step). */
const COUNTED_STEPS = ONBOARDING_STEPS.filter((s) => s !== 'ready');

const SUMMARY_SELECT = {
  id: true,
  name: true,
  slug: true,
  academyType: true,
  status: true,
  createdAt: true,
  subscription: { select: { planKey: true } },
  onboarding: { select: { completedAt: true } },
} satisfies Prisma.TenantSelect;

type SummaryRow = Prisma.TenantGetPayload<{ select: typeof SUMMARY_SELECT }>;

/**
 * Academy management in the console (C-02, C-87, C-96): the list, one academy's overview and
 * domains, status changes with a reason, subdomain changes (the old address redirects for good)
 * and re-sending the owner's invitation. Every change is audited against the academy, ends the
 * academy's sessions when it closes (C-86) and drops its cached host answers so it shows within a
 * minute (C-96).
 */
@Injectable()
export class AcademiesService {
  private readonly root: string;

  constructor(
    private readonly platform: PlatformDb,
    private readonly slugs: SlugAvailabilityService,
    private readonly ownerInvites: OwnerInviteService,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
    private readonly resolver: TenantResolver,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(API_CONFIG) config: ApiConfig,
  ) {
    this.root = normalizeRootDomain(platformRootDomain(config));
  }

  async list(query: {
    limit: number;
    cursor?: string | undefined;
    q?: string | undefined;
    status?: TenantStatus | undefined;
  }): Promise<{ items: AcademySummary[]; nextCursor: string | null }> {
    const after = query.cursor ? decodeCursor(query.cursor, CursorKeys) : undefined;
    if (after === null)
      throw new DomainError('VALIDATION_FAILED', 'bad cursor', [
        { path: 'cursor', issue: 'invalid' },
      ]);
    const where: Prisma.TenantWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { slug: { contains: query.q.toLowerCase() } },
            ],
          }
        : {}),
      ...(after
        ? {
            AND: [
              {
                OR: [
                  { createdAt: { lt: new Date(after.c) } },
                  { createdAt: new Date(after.c), id: { lt: after.id } },
                ],
              },
            ],
          }
        : {}),
    };
    const rows = await this.platform.db.tenant.findMany({
      where,
      select: SUMMARY_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((r) => this.summary(r)),
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor({ c: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  /** One academy (C-02). Viewing is recorded on the academy's audit trail unless told not to. */
  async detail(id: string, options: { audit?: boolean } = {}): Promise<AcademyDetail> {
    const db = this.platform.db;
    const tenant = await db.tenant.findUnique({
      where: { id },
      select: {
        ...SUMMARY_SELECT,
        previousStatus: true,
        statusReason: true,
        statusChangedAt: true,
        subscription: {
          select: {
            planKey: true,
            status: true,
            trialEndsAt: true,
            plan: { select: { name: true } },
          },
        },
        onboarding: { select: { completedAt: true, currentStep: true, steps: true } },
        domains: {
          select: { hostname: true, kind: true, role: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!tenant) throw new DomainError('NOT_FOUND', 'academy');

    const [invitation, owner] = await Promise.all([
      db.invitation.findFirst({
        where: { tenantId: id, roleKeys: { has: 'owner' }, invitedById: null },
        orderBy: { createdAt: 'desc' },
        select: {
          email: true,
          inviteeName: true,
          createdAt: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
        },
      }),
      db.membership.findFirst({
        where: { tenantId: id, status: 'ACTIVE', roles: { some: { role: { key: 'owner' } } } },
        orderBy: { createdAt: 'asc' },
        select: { user: { select: { name: true, email: true } } },
      }),
    ]);

    const steps = (tenant.onboarding?.steps ?? {}) as Record<
      string,
      { status?: string } | undefined
    >;
    const completedSteps = COUNTED_STEPS.filter((s) =>
      ['done', 'skipped'].includes(steps[s]?.status ?? ''),
    ).length;

    if (options.audit !== false)
      await this.audit.record(
        { action: 'platform.tenant_viewed', tenantId: id, entityType: 'Tenant', entityId: id },
        db,
      );

    return {
      ...this.summary(tenant),
      previousStatus: tenant.previousStatus,
      statusReason: tenant.statusReason,
      statusChangedAt: tenant.statusChangedAt?.toISOString() ?? null,
      plan: tenant.subscription
        ? {
            key: tenant.subscription.planKey,
            name: tenant.subscription.plan.name,
            status: tenant.subscription.status,
            trialEndsAt: tenant.subscription.trialEndsAt?.toISOString() ?? null,
          }
        : null,
      owner: {
        name: owner?.user.name ?? invitation?.inviteeName ?? null,
        email: owner?.user.email ?? invitation?.email ?? null,
        invitation: {
          status: inviteStatus(invitation),
          sentAt: invitation?.createdAt.toISOString() ?? null,
          expiresAt: invitation?.expiresAt.toISOString() ?? null,
        },
      },
      onboarding: {
        currentStep: tenant.onboarding?.currentStep ?? null,
        completedSteps: tenant.onboarding?.completedAt ? COUNTED_STEPS.length : completedSteps,
        totalSteps: COUNTED_STEPS.length,
        completedAt: tenant.onboarding?.completedAt?.toISOString() ?? null,
      },
      domains: tenant.domains.map((d) => ({
        host: d.kind === 'SUBDOMAIN' ? tenantHost(d.hostname, this.root) : d.hostname,
        role: d.role,
        kind: d.kind,
        createdAt: d.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Suspend, reactivate, activate or archive (C-87). The row is locked so two staff members can't
   * apply conflicting changes; closing an academy revokes its sessions in the same transaction.
   */
  async transition(id: string, action: TenantTransition, reason: string): Promise<AcademyDetail> {
    const revoked = await this.platform.transaction(async (tx) => {
      const [row] = await tx.$queryRaw<
        { status: TenantStatus; previous_status: TenantStatus | null }[]
      >`
        SELECT status, previous_status FROM tenant WHERE id = ${id}::uuid FOR UPDATE`;
      if (!row) throw new DomainError('NOT_FOUND', 'academy');
      const next = nextTenantStatus(action, row.status, row.previous_status);
      if (!next) throw new DomainError('INVALID_STATE_TRANSITION', `${action} from ${row.status}`);

      await tx.tenant.update({
        where: { id },
        data: {
          status: next,
          previousStatus:
            action === 'suspend'
              ? row.status
              : action === 'reactivate'
                ? null
                : row.previous_status,
          statusReason: reason,
          statusChangedAt: new Date(),
        },
      });
      let sessions: string[] = [];
      if (next === 'SUSPENDED' || next === 'ARCHIVED') {
        const live = await tx.authSession.findMany({
          where: { tenantId: id, revokedAt: null },
          select: { id: true },
        });
        sessions = live.map((s) => s.id);
        if (sessions.length)
          await tx.authSession.updateMany({
            where: { id: { in: sessions } },
            data: { revokedAt: new Date(), revokeReason: `tenant_${next.toLowerCase()}` },
          });
      }
      await this.audit.record(
        {
          action: `platform.tenant_${PAST[action]}`,
          tenantId: id,
          entityType: 'Tenant',
          entityId: id,
          before: { status: row.status },
          after: { status: next },
          metadata: { reason, sessionsRevoked: sessions.length },
        },
        tx,
      );
      await this.analytics.track(tx, 'academy.status_changed', { action }, { tenantId: id });
      return sessions;
    });
    await this.resolver.invalidateTenant(id);
    if (revoked.length)
      await this.redis.del(...revoked.map(sessionCacheKey)).catch(() => undefined);
    return this.detail(id, { audit: false });
  }

  /**
   * New primary subdomain (PRD v3.1 §F): the academy id never changes; the old subdomain becomes a
   * REDIRECT (301) and stays reserved for this academy (ARCHITECTURE §5.1).
   */
  async changeSubdomain(id: string, input: string): Promise<AcademyDetail> {
    let fromSlug = '';
    let toSlug = '';
    try {
      await this.platform.transaction(async (tx) => {
        const [row] = await tx.$queryRaw<{ slug: string }[]>`
          SELECT slug FROM tenant WHERE id = ${id}::uuid FOR UPDATE`;
        if (!row) throw new DomainError('NOT_FOUND', 'academy');
        const availability = await this.slugs.check(input, tx);
        if (availability.slug === row.slug)
          throw new DomainError('VALIDATION_FAILED', 'same subdomain', [
            { path: 'slug', issue: 'unchanged' },
          ]);
        if (availability.status !== 'available')
          throw new DomainError(
            availability.status === 'taken' ? 'CONFLICT' : 'VALIDATION_FAILED',
            `subdomain ${availability.status}`,
            [
              { path: 'slug', issue: availability.problem ?? availability.status },
              ...availability.suggestions.map((s) => ({ path: 'suggestions', issue: s })),
            ],
          );
        fromSlug = row.slug;
        toSlug = availability.slug;
        // Demote first: the partial unique index allows one PRIMARY per academy.
        await tx.tenantDomain.updateMany({
          where: { tenantId: id, role: 'PRIMARY', kind: 'SUBDOMAIN' },
          data: { role: 'REDIRECT' },
        });
        await tx.tenantDomain.create({
          data: {
            id: newId(),
            tenantId: id,
            hostname: toSlug,
            kind: 'SUBDOMAIN',
            role: 'PRIMARY',
            verification: 'VERIFIED',
            verifiedAt: new Date(),
          },
        });
        await tx.tenant.update({ where: { id }, data: { slug: toSlug } });
        await this.audit.record(
          {
            action: 'platform.tenant_subdomain_changed',
            tenantId: id,
            entityType: 'Tenant',
            entityId: id,
            before: { slug: fromSlug },
            after: { slug: toSlug },
          },
          tx,
        );
        await this.analytics.track(tx, 'academy.subdomain_changed', {}, { tenantId: id });
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        throw new DomainError('CONFLICT', 'subdomain taken', [{ path: 'slug', issue: 'taken' }]);
      throw error;
    }
    await this.resolver.invalidateTenant(id);
    await this.resolver.invalidateHost(toSlug);
    await this.resolver.invalidateHost(fromSlug);
    return this.detail(id, { audit: false });
  }

  /** A fresh owner invitation; earlier pending ones stop working (C-67). */
  async resendOwnerInvite(id: string): Promise<AcademyDetail> {
    await this.platform.transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id },
        select: {
          slug: true,
          status: true,
          branding: { select: { displayName: true, primaryColor: true } },
        },
      });
      if (!tenant) throw new DomainError('NOT_FOUND', 'academy');
      if (tenant.status !== 'SETUP' && tenant.status !== 'ACTIVE')
        throw new DomainError('INVALID_STATE_TRANSITION', 'academy not open');
      const owner = await tx.membership.findFirst({
        where: { tenantId: id, status: 'ACTIVE', roles: { some: { role: { key: 'owner' } } } },
        select: { id: true },
      });
      if (owner)
        throw new DomainError('CONFLICT', 'owner already joined', [
          { path: 'owner', issue: 'already_joined' },
        ]);
      const last = await tx.invitation.findFirst({
        where: { tenantId: id, roleKeys: { has: 'owner' }, invitedById: null },
        orderBy: { createdAt: 'desc' },
        select: { email: true, inviteeName: true },
      });
      if (!last?.email) throw new DomainError('NOT_FOUND', 'no owner invitation');
      await tx.invitation.updateMany({
        where: { tenantId: id, roleKeys: { has: 'owner' }, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.ownerInvites.send(tx, {
        tenantId: id,
        slug: tenant.slug,
        academy: tenant.branding?.displayName ?? tenant.slug,
        primaryColor: tenant.branding?.primaryColor ?? null,
        owner: { name: last.inviteeName ?? '', email: last.email },
      });
      await this.audit.record(
        {
          action: 'platform.owner_invite_resent',
          tenantId: id,
          entityType: 'Tenant',
          entityId: id,
        },
        tx,
      );
    });
    return this.detail(id, { audit: false });
  }

  private summary(r: SummaryRow): AcademySummary {
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      host: tenantHost(r.slug, this.root),
      academyType: r.academyType,
      status: r.status,
      planKey: r.subscription?.planKey ?? null,
      onboardingCompleted: Boolean(r.onboarding?.completedAt),
      createdAt: r.createdAt.toISOString(),
    };
  }
}

const PAST: Record<TenantTransition, string> = {
  suspend: 'suspended',
  reactivate: 'reactivated',
  activate: 'activated',
  archive: 'archived',
};

function inviteStatus(
  i: { expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null } | null,
): 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED' | 'NONE' {
  if (!i) return 'NONE';
  if (i.acceptedAt) return 'ACCEPTED';
  if (i.revokedAt) return 'REVOKED';
  return i.expiresAt.getTime() > Date.now() ? 'PENDING' : 'EXPIRED';
}
