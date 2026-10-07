import { generateToken, hashPassword, hashToken, verifyPassword } from '@academybee/auth';
import {
  type AcceptInvitation,
  canGrantRole,
  type CreateInvitation,
  type AcceptInvitationResponse,
  newId,
  RoleKeySchema,
  type StaffRoleKey,
  StaffRoleKeySchema,
  INVITATION_LINK_PATH,
  INVITATION_TTL_MS,
} from '@academybee/contracts';
import { bindUser, type TenantBoundClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { type Response } from 'express';
import { ClsService } from 'nestjs-cls';

import { AnalyticsService } from '../../core/analytics/analytics.service.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { MembershipService } from '../../core/auth/membership.service.js';
import { mfaRecommendedFor, MfaPolicyService } from '../../core/auth/mfa-policy.service.js';
import { MfaService } from '../../core/auth/mfa.service.js';
import { assertPasswordPolicy, identityParts } from '../../core/auth/password.service.js';
import { SessionService } from '../../core/auth/session.service.js';
import { type RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { EmailService } from '../../core/email/email.service.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { RATE_RULES, RateLimiter } from '../../core/rate-limit/rate-limiter.service.js';

const INVITE_TTL_MS = INVITATION_TTL_MS;
const INVITE_LINK = INVITATION_LINK_PATH;

type InvitationRow = {
  id: string;
  email: string | null;
  roleKeys: string[];
  expiresAt: Date;
  createdAt: Date;
};

const INVITATION_SELECT = {
  id: true,
  email: true,
  roleKeys: true,
  expiresAt: true,
  createdAt: true,
} as const;

/**
 * Staff invitations (ARCHITECTURE §6, C-67). An invite is a single-use link (7 days) to the
 * academy's own subdomain. Accepting proves the email: a new person sets a name and password; an
 * existing AcademyBee user confirms with their current password. Either way they join as an
 * ACTIVE member with the invited roles and are signed in. Invalid, expired, revoked and used
 * links all answer 404.
 */
@Injectable()
export class InvitationsService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly memberships: MembershipService,
    private readonly sessions: SessionService,
    private readonly mfa: MfaService,
    private readonly mfaPolicy: MfaPolicyService,
    private readonly emails: EmailService,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
    private readonly rate: RateLimiter,
  ) {}

  async create(input: CreateInvitation) {
    const { tenantId, userId } = this.caller();
    const roles = [...new Set(input.roles)];
    this.assertGrantable(roles);
    await this.rate.consume(RATE_RULES.invitesPerMember, tenantId, userId);
    await this.rate.consume(RATE_RULES.resetOrInvite, tenantId, input.email);

    const existing = await this.db.$withLookup({ identifier: input.email }, async (tx) => {
      const user = await tx.user.findFirst({ where: { email: input.email }, select: { id: true } });
      return user
        ? tx.membership.findFirst({ where: { userId: user.id }, select: { id: true } })
        : null;
    });
    if (existing)
      throw new DomainError('CONFLICT', 'already a member', [
        { path: 'email', issue: 'already_member' },
      ]);

    const token = generateToken();
    const row = await this.db.$transaction(async (tx) => {
      // Inviting the same email again replaces the earlier link.
      await tx.invitation.updateMany({
        where: { email: input.email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const created = await tx.invitation.create({
        data: {
          id: newId(),
          tenantId,
          email: input.email,
          roleKeys: roles,
          tokenHash: hashToken(token),
          invitedById: userId,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        },
        select: INVITATION_SELECT,
      });
      await this.sendInvite(tx, input.email, token);
      await this.audit.record(
        {
          action: 'team.invitation_sent',
          entityType: 'Invitation',
          entityId: created.id,
          after: { roles },
        },
        tx,
      );
      await this.analytics.track(tx, 'team.invitation_sent', { roles, resend: false });
      return created;
    });
    return this.toInvitation(row);
  }

  async list() {
    const rows = await this.db.invitation.findMany({
      where: { acceptedAt: null, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: INVITATION_SELECT,
    });
    return { invitations: rows.map((r) => this.toInvitation(r)) };
  }

  async revoke(id: string): Promise<void> {
    const row = await this.pending(id);
    this.assertGrantable(row.roleKeys);
    await this.db.$transaction(async (tx) => {
      const done = await tx.invitation.updateMany({
        where: { id: row.id, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (done.count !== 1) throw new DomainError('NOT_FOUND', 'invitation gone');
      await this.audit.record(
        { action: 'team.invitation_revoked', entityType: 'Invitation', entityId: row.id },
        tx,
      );
    });
  }

  async resend(id: string) {
    const { tenantId } = this.caller();
    const row = await this.pending(id);
    this.assertGrantable(row.roleKeys);
    if (!row.email) throw new DomainError('CONFLICT', 'no email');
    await this.rate.consume(RATE_RULES.resetOrInvite, tenantId, row.email);
    const token = generateToken();
    const updated = await this.db.$transaction(async (tx) => {
      const next = await tx.invitation.update({
        where: { id: row.id },
        data: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
        select: INVITATION_SELECT,
      });
      await this.sendInvite(tx, row.email!, token);
      await this.audit.record(
        { action: 'team.invitation_resent', entityType: 'Invitation', entityId: row.id },
        tx,
      );
      await this.analytics.track(tx, 'team.invitation_sent', {
        roles: row.roleKeys.filter(
          (k): k is StaffRoleKey => StaffRoleKeySchema.safeParse(k).success,
        ),
        resend: true,
      });
      return next;
    });
    return this.toInvitation(updated);
  }

  /** What the link shows before accepting. */
  async preview(token: string) {
    const invitation = await this.findByToken(token);
    const [branding, user] = await Promise.all([
      this.db.tenantBranding.findFirst({ select: { displayName: true } }),
      invitation.email
        ? this.db.$withLookup({ identifier: invitation.email }, (tx) =>
            tx.user.findFirst({ where: { email: invitation.email! }, select: { id: true } }),
          )
        : null,
    ]);
    return {
      academy: { name: branding?.displayName ?? '' },
      email: invitation.email,
      roles: invitation.roleKeys,
      accountExists: user !== null,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async accept(
    token: string,
    input: Omit<AcceptInvitation, 'token'>,
    res: Response,
  ): Promise<AcceptInvitationResponse> {
    const tenantId = this.cls.get('tenantId')!;
    const invitation = await this.findByToken(token);
    const email = invitation.email;
    if (!email) throw new DomainError('NOT_FOUND', 'phone invitations arrive in Phase 10');

    const existing = await this.db.$withLookup({ identifier: email }, async (tx) => {
      const user = await tx.user.findFirst({
        where: { email },
        select: { id: true, name: true, status: true, emailVerifiedAt: true },
      });
      if (!user) return null;
      await bindUser(tx, user.id);
      const credential = await tx.userCredential.findFirst({
        select: { passwordHash: true, failedCount: true, lockedUntil: true },
      });
      return { user, credential };
    });

    let user: { id: string; name: string };
    let passwordHash: string | undefined;
    if (existing) {
      // An existing account proves itself with its current password (counts towards the lock).
      const { credential } = existing;
      if (existing.user.status !== 'ACTIVE' || !credential)
        throw new DomainError('INVALID_CREDENTIALS');
      if (credential.lockedUntil && credential.lockedUntil.getTime() > Date.now())
        throw new DomainError(
          'RATE_LIMITED',
          'account locked',
          undefined,
          (credential.lockedUntil.getTime() - Date.now()) / 1000,
        );
      if (!(await verifyPassword(credential.passwordHash, input.password))) {
        await this.sessions.passwordFailed(existing.user.id, credential.failedCount + 1);
        throw new DomainError('INVALID_CREDENTIALS');
      }
      user = { id: existing.user.id, name: existing.user.name };
    } else {
      if (!input.name)
        throw new DomainError('VALIDATION_FAILED', 'name required', [
          { path: 'name', issue: 'required' },
        ]);
      assertPasswordPolicy(input.password, identityParts({ email, name: input.name }));
      passwordHash = await hashPassword(input.password);
      user = { id: newId(), name: input.name };
    }

    const roleKeys = invitation.roleKeys;
    await this.db.$withLookup({ identifier: email }, async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: {
          id: invitation.id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { acceptedAt: new Date(), acceptedUserId: user.id },
      });
      if (claimed.count !== 1) throw new DomainError('NOT_FOUND', 'invitation gone');
      if (passwordHash) {
        await tx.user.createMany({
          data: { id: user.id, email, name: user.name, emailVerifiedAt: new Date() },
        });
        await bindUser(tx, user.id);
        await tx.userCredential.create({ data: { userId: user.id, passwordHash } });
      } else {
        await bindUser(tx, user.id);
        if (!existing?.user.emailVerifiedAt)
          await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      }
      if (await tx.membership.findFirst({ where: { userId: user.id }, select: { id: true } }))
        throw new DomainError('CONFLICT', 'already a member', [
          { path: 'token', issue: 'already_member' },
        ]);
      const membershipId = newId();
      await tx.membership.create({
        data: { id: membershipId, tenantId, userId: user.id, status: 'ACTIVE' },
        select: { id: true },
      });
      const roles = await tx.role.findMany({
        where: { key: { in: roleKeys } },
        select: { id: true },
      });
      if (roles.length !== roleKeys.length) throw new DomainError('CONFLICT', 'role missing');
      await tx.membershipRole.createMany({
        data: roles.map((r) => ({ tenantId, membershipId, roleId: r.id })),
      });
      await this.audit.record(
        {
          action: 'team.invitation_accepted',
          actor: { type: 'USER', id: user.id },
          entityType: 'Invitation',
          entityId: invitation.id,
          metadata: { newAccount: passwordHash !== undefined, membershipId },
        },
        tx,
      );
      await this.analytics.track(tx, 'team.invitation_accepted', {
        newAccount: passwordHash !== undefined,
      });
    });

    await this.memberships.invalidate(tenantId, user.id);
    const roles = roleKeys.flatMap((k) => {
      const parsed = RoleKeySchema.safeParse(k);
      return parsed.success ? [parsed.data] : [];
    });
    // 2FA applies here too: a user who has it, or whose new role requires it, gets the code step
    // before any session (C-80).
    if ((await this.mfa.isEnabled(user.id)) || (await this.mfaPolicy.isRequiredFor(roles)))
      return { mfa: await this.mfa.begin(user.id, 'TENANT', tenantId) };
    return this.sessions.signInToAcademy(res, user, tenantId, roles, {
      promptMfa: mfaRecommendedFor(roles),
    });
  }

  private async findByToken(token: string): Promise<InvitationRow> {
    await this.rate.consume(RATE_RULES.tokenAttempts, this.cls.get('ip') ?? 'unknown');
    if (token.length < 16 || token.length > 128) throw new DomainError('NOT_FOUND', 'bad token');
    const hash = hashToken(token);
    const row = await this.db.$withLookup({ token: hash }, (tx) =>
      tx.invitation.findFirst({
        where: {
          tokenHash: hash,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { ...INVITATION_SELECT, invitedById: true },
      }),
    );
    if (!row) throw new DomainError('NOT_FOUND', 'invitation not valid');
    // The invitation is only as good as its sender: someone since disabled, or who can no longer
    // grant these roles, can't let anyone in (review L4). Answered like any invalid link.
    if (row.invitedById) {
      const inviter = await this.memberships.load(this.cls.get('tenantId'), row.invitedById);
      if (
        inviter?.status !== 'ACTIVE' ||
        !inviter.capabilities['team.invite'] ||
        !row.roleKeys.every((role) => canGrantRole(inviter, role))
      )
        throw new DomainError('NOT_FOUND', 'inviter no longer allowed');
    }
    return row;
  }

  private async pending(id: string): Promise<InvitationRow> {
    const row = await this.db.invitation.findFirst({
      where: { id, acceptedAt: null, revokedAt: null },
      select: INVITATION_SELECT,
    });
    if (!row) throw new DomainError('NOT_FOUND', 'invitation missing');
    return row;
  }

  private async sendInvite(
    tx: Parameters<Parameters<TenantBoundClient['$transaction']>[0]>[0],
    to: string,
    token: string,
  ): Promise<void> {
    const inviter = await tx.user.findFirst({
      where: { id: this.caller().userId },
      select: { name: true },
    });
    await this.emails.request(tx, {
      template: 'invite',
      to,
      locale: 'en-IN',
      ...(await this.emails.academySender(tx)),
      vars: { inviter: inviter?.name ?? '' },
      link: { path: INVITE_LINK, token },
    });
  }

  private assertGrantable(roles: readonly string[]): void {
    const me = this.cls.get('membership');
    for (const role of roles)
      if (!me || !canGrantRole(me, role))
        throw new DomainError('FORBIDDEN', 'role not grantable', [{ path: 'roles', issue: role }]);
  }

  private caller(): { tenantId: string; userId: string } {
    const tenantId = this.cls.get('tenantId');
    const userId = this.cls.get('userId');
    if (!tenantId || !userId) throw new DomainError('UNAUTHENTICATED');
    return { tenantId, userId };
  }

  private toInvitation(r: InvitationRow) {
    return {
      id: r.id,
      email: r.email,
      roles: r.roleKeys,
      status: r.expiresAt.getTime() > Date.now() ? ('PENDING' as const) : ('EXPIRED' as const),
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    };
  }
}
