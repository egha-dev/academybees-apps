import { generateToken, hashToken } from '@academybee/auth';
import {
  type ConsentPurpose,
  currentNoticeVersion,
  INVITATION_LINK_PATH,
  newId,
  PARENT_INVITATION_TTL_MS,
} from '@academybee/contracts';
import type { TenantBoundClient, TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { AnalyticsService } from '../../../core/analytics/analytics.service.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { MembershipService } from '../../../core/auth/membership.service.js';
import type { RequestContext } from '../../../core/context/request-context.js';
import { TENANT_DB } from '../../../core/database/database.module.js';
import { EmailService } from '../../../core/email/email.service.js';
import { DomainError } from '../../../core/errors/domain-error.js';
import { RATE_RULES, RateLimiter } from '../../../core/rate-limit/rate-limiter.service.js';
import { scopedWhere } from '../../../core/rbac/scope.js';
import { parentPolicy } from '../people.policy.js';

/**
 * Parents and the Family Hub (G-31, ADR-039) with consent (G-06, ADR-034):
 * - **Invite** (C-102): an `Invitation` for the `parent` role tied to the parent record, emailed
 *   with a Family Hub link valid 30 days. The parent accepts and consents on the hub (7P); no
 *   account is created before they do.
 * - **Activation guard**: a parent membership becomes ACTIVE only when this parent has a current
 *   consent given in the Family Hub (channel FAMILY_HUB, including `service`) for every child
 *   linked to them here. Staff-recorded (paper) consent never activates (C-103).
 */
@Injectable()
export class ParentAccessService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly emails: EmailService,
    private readonly memberships: MembershipService,
    private readonly rate: RateLimiter,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
  ) {}

  async invite(parentId: string): Promise<{ email: string; expiresAt: string }> {
    const parent = await this.db.parent.findFirst({
      where: {
        AND: [
          { id: parentId, status: 'ACTIVE' },
          scopedWhere(this.cls, 'parent.manage', parentPolicy),
        ],
      },
      select: {
        id: true,
        tenantId: true,
        fullName: true,
        email: true,
        userId: true,
        children: { select: { student: { select: { fullName: true, archivedAt: true } } } },
      },
    });
    if (!parent) throw new DomainError('NOT_FOUND', 'parent');
    if (!parent.email)
      throw new DomainError('VALIDATION_FAILED', 'no email', [
        { path: 'email', issue: 'required' },
      ]);
    const children = parent.children
      .filter((c) => !c.student.archivedAt)
      .map((c) => c.student.fullName);
    if (children.length === 0)
      throw new DomainError('VALIDATION_FAILED', 'no children', [
        { path: 'children', issue: 'required' },
      ]);
    if (parent.userId && (await this.isActiveMember(parent.tenantId, parent.userId)))
      throw new DomainError('CONFLICT', 'already on the hub', [
        { path: 'parentId', issue: 'already_member' },
      ]);
    const membershipId = this.cls.get('membership')?.id;
    const userId = this.cls.get('userId');
    await this.rate.consume(RATE_RULES.resetOrInvite, parent.tenantId, parent.email);
    const token = generateToken();
    const expiresAt = new Date(Date.now() + PARENT_INVITATION_TTL_MS);
    const academy = await this.db.tenantBranding.findFirst({
      select: { displayName: true, primaryColor: true },
    });
    await this.db.$transaction(async (tx) => {
      // A new invitation replaces any earlier open one for this parent.
      const revoked = await tx.invitation.updateMany({
        where: { parentId: parent.id, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.invitation.create({
        data: {
          id: newId(),
          tenantId: parent.tenantId,
          email: parent.email!,
          inviteeName: parent.fullName,
          roleKeys: ['parent'],
          parentId: parent.id,
          tokenHash: hashToken(token),
          invitedById: userId ?? null,
          expiresAt,
        },
      });
      await this.emails.request(tx, {
        template: 'parent_invite',
        to: parent.email!,
        locale: 'en-IN',
        host: { kind: 'hub' },
        ...(academy
          ? {
              academy: {
                displayName: academy.displayName,
                primaryColor: academy.primaryColor ?? null,
              },
            }
          : {}),
        vars: {
          parent: parent.fullName,
          children: new Intl.ListFormat('en-IN', { type: 'conjunction' })
            .format(children)
            .slice(0, 200),
        },
        link: { path: INVITATION_LINK_PATH, token },
      });
      await this.audit.record(
        {
          action: 'parent.invited',
          entityType: 'Parent',
          entityId: parent.id,
          metadata: { by: membershipId ?? null, resend: revoked.count > 0 },
        },
        tx,
      );
      await this.analytics.track(tx, 'parent.invited', { resend: revoked.count > 0 });
    });
    return { email: parent.email, expiresAt: expiresAt.toISOString() };
  }

  async revoke(parentId: string): Promise<void> {
    const parent = await this.db.parent.findFirst({
      where: { AND: [{ id: parentId }, scopedWhere(this.cls, 'parent.manage', parentPolicy)] },
      select: { id: true },
    });
    if (!parent) throw new DomainError('NOT_FOUND', 'parent');
    await this.db.$transaction(async (tx) => {
      const revoked = await tx.invitation.updateMany({
        where: { parentId, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count)
        await this.audit.record(
          { action: 'parent.invitation_revoked', entityType: 'Parent', entityId: parentId },
          tx,
        );
    });
  }

  /** Hub access per parent: member (signed in here), invited (open link), or none. */
  async accessFor(
    parents: Array<{ id: string; userId: string | null }>,
  ): Promise<
    Map<string, { access: 'MEMBER' | 'INVITED' | 'NONE'; inviteExpiresAt: string | null }>
  > {
    const out = new Map<
      string,
      { access: 'MEMBER' | 'INVITED' | 'NONE'; inviteExpiresAt: string | null }
    >();
    if (!parents.length) return out;
    const [invites, members] = await Promise.all([
      this.db.invitation.findMany({
        where: {
          parentId: { in: parents.map((p) => p.id) },
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { parentId: true, expiresAt: true },
      }),
      this.db.membership.findMany({
        where: {
          userId: { in: parents.map((p) => p.userId).filter((v): v is string => !!v) },
          status: 'ACTIVE',
        },
        select: { userId: true },
      }),
    ]);
    const active = new Set(members.map((m) => m.userId));
    for (const p of parents) {
      const invite = invites.find((i) => i.parentId === p.id);
      out.set(p.id, {
        access: p.userId && active.has(p.userId) ? 'MEMBER' : invite ? 'INVITED' : 'NONE',
        inviteExpiresAt:
          invite && !(p.userId && active.has(p.userId)) ? invite.expiresAt.toISOString() : null,
      });
    }
    return out;
  }

  /**
   * The user's parent membership here, created INVITED if missing (join approval, link verify).
   * It becomes ACTIVE only through `activate`.
   */
  async ensureMembership(tx: TransactionClient, tenantId: string, userId: string): Promise<string> {
    const existing = await tx.membership.findFirst({ where: { userId }, select: { id: true } });
    const role = await tx.role.findFirst({ where: { key: 'parent' }, select: { id: true } });
    if (!role) throw new DomainError('INTERNAL', 'parent role missing');
    const membershipId = existing?.id ?? newId();
    if (!existing)
      await tx.membership.create({
        data: { id: membershipId, tenantId, userId, status: 'INVITED' },
      });
    await tx.membershipRole.createMany({
      data: [{ tenantId, membershipId, roleId: role.id }],
      skipDuplicates: true,
    });
    return membershipId;
  }

  /**
   * Record the parent's own consent, given in the Family Hub, for every child linked to them here
   * (G-06 "on every new academy link"), with the current notice version.
   */
  async recordHubConsent(
    tx: TransactionClient,
    input: { tenantId: string; parentId: string; purposes: ConsentPurpose[] },
  ): Promise<number> {
    const links = await tx.parentStudent.findMany({
      where: { parentId: input.parentId, student: { archivedAt: null } },
      select: { studentId: true },
    });
    for (const link of links)
      await tx.consentRecord.create({
        data: {
          id: newId(),
          tenantId: input.tenantId,
          parentId: input.parentId,
          studentId: link.studentId,
          action: 'GRANT',
          purposes: input.purposes,
          noticeVersion: currentNoticeVersion(),
          channel: 'FAMILY_HUB',
        },
      });
    return links.length;
  }

  /**
   * The activation guard (G-06, C-102, C-103): ACTIVE only with this parent's current hub consent
   * (latest record a FAMILY_HUB GRANT that includes `service`) for every linked child.
   */
  async activate(
    tx: TransactionClient,
    input: { tenantId: string; userId: string; parentId: string },
  ): Promise<void> {
    const links = await tx.parentStudent.findMany({
      where: { parentId: input.parentId, student: { archivedAt: null } },
      select: { studentId: true },
    });
    if (links.length === 0)
      throw new DomainError('FORBIDDEN', 'no children linked', [
        { path: 'parentId', issue: 'no_children' },
      ]);
    for (const link of links) {
      const latest = await tx.consentRecord.findFirst({
        where: { parentId: input.parentId, studentId: link.studentId },
        orderBy: { recordedAt: 'desc' },
        select: { action: true, channel: true, purposes: true },
      });
      if (
        !latest ||
        latest.action !== 'GRANT' ||
        latest.channel !== 'FAMILY_HUB' ||
        !latest.purposes.includes('service')
      )
        throw new DomainError('FORBIDDEN', 'consent required', [
          { path: 'consent', issue: 'consent_required' },
        ]);
    }
    const membershipId = await this.ensureMembership(tx, input.tenantId, input.userId);
    await tx.membership.update({
      where: { id: membershipId },
      data: { status: 'ACTIVE', permissionsVersion: { increment: 1 } },
    });
    await this.audit.record(
      {
        action: 'parent.activated',
        entityType: 'Parent',
        entityId: input.parentId,
        actor: { type: 'USER', id: input.userId },
      },
      tx,
    );
    await this.memberships.invalidate(input.tenantId, input.userId);
  }

  private async isActiveMember(tenantId: string, userId: string): Promise<boolean> {
    const m = await this.db.membership.findFirst({
      where: { userId, tenantId, status: 'ACTIVE' },
      select: { id: true },
    });
    return Boolean(m);
  }
}
