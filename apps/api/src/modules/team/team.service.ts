import {
  canGrantRole,
  type CursorPage,
  type CursorPageQuery,
  decodeCursor,
  encodeCursor,
  ROLE_TEMPLATES,
  RoleKeySchema,
  StaffRoleKeySchema,
  type TeamMember,
  type UpdateTeamMember,
} from '@academybee/contracts';
import { type TenantBoundClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';

import { AuditService } from '../../core/audit/audit.service.js';
import { MembershipService } from '../../core/auth/membership.service.js';
import { SessionService } from '../../core/auth/session.service.js';
import { type MembershipInfo, type RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { assertInScope, scopedWhere } from '../../core/rbac/scope.js';
import { membershipPolicy } from './team.policy.js';

const MEMBER_SELECT = {
  id: true,
  userId: true,
  status: true,
  branchIds: true,
  permissionsVersion: true,
  user: { select: { name: true, email: true, phone: true, lastLoginAt: true } },
  roles: { select: { role: { select: { id: true, key: true, name: true } } } },
} as const;

type MemberRow = {
  id: string;
  userId: string;
  status: TeamMember['status'];
  branchIds: string[];
  permissionsVersion: number;
  user: { name: string; email: string | null; phone: string | null; lastLoginAt: Date | null };
  roles: Array<{ role: { id: string; key: string; name: string } }>;
};

const CursorKeys = z.object({ id: z.uuid() });
const FAMILY_ROLE_KEYS = ['parent', 'student'] as const;

/**
 * The academy team (ARCHITECTURE §7, C-67): who works here, with which roles. Members are
 * listed and changed within the caller's scope; nobody changes their own access, only owners
 * touch owners, and roles are granted only by someone who holds everything they grant.
 */
@Injectable()
export class TeamService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly memberships: MembershipService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async list(query: CursorPageQuery): Promise<CursorPage<TeamMember>> {
    const after = query.cursor ? decodeCursor(query.cursor, CursorKeys) : undefined;
    if (after === null) throw new DomainError('VALIDATION_FAILED', 'bad cursor');
    const rows = (await this.db.membership.findMany({
      where: {
        AND: [
          scopedWhere(this.cls, 'team.read', membershipPolicy),
          // The team is staff: members holding at least one role outside the Family Hub. Parents
          // and students are managed with their children's records (Phase 4, G-31).
          { roles: { some: { role: { key: { notIn: [...FAMILY_ROLE_KEYS] } } } } },
          after ? { id: { gt: after.id } } : {},
        ],
      },
      orderBy: { id: 'asc' },
      take: query.limit + 1,
      select: MEMBER_SELECT,
    })) as MemberRow[];
    const page = rows.slice(0, query.limit);
    return {
      items: page.map((r) => this.toMember(r)),
      nextCursor:
        rows.length > query.limit ? encodeCursor({ id: page[page.length - 1]!.id }) : null,
    };
  }

  async update(id: string, change: UpdateTeamMember): Promise<TeamMember> {
    const me = this.me();
    const found: MemberRow | null = await this.db.membership.findFirst({
      where: { id },
      select: MEMBER_SELECT,
    });
    assertInScope(this.cls, 'team.manage', membershipPolicy, found);
    const row = found!;
    if (row.userId === this.cls.get('userId'))
      throw new DomainError('FORBIDDEN', 'own access', [{ path: 'id', issue: 'self' }]);

    const current = row.roles.map((r) => r.role.key);
    const isOwner = current.includes('owner');
    if (isOwner && !me.roles.includes('owner'))
      throw new DomainError('FORBIDDEN', 'owners only', [{ path: 'id', issue: 'owner_only' }]);
    if (row.permissionsVersion !== change.version) throw new DomainError('VERSION_CONFLICT');

    const next = change.roles ? [...new Set(change.roles)] : current;
    const added = next.filter((k) => !current.includes(k));
    const removed = current.filter((k) => !next.includes(k));
    for (const key of [...added, ...removed.filter((k) => StaffRoleKeySchema.safeParse(k).success)])
      if (!canGrantRole(me, key))
        throw new DomainError('FORBIDDEN', 'role not grantable', [{ path: 'roles', issue: key }]);
    const status = change.status ?? row.status;
    if (!added.length && !removed.length && status === row.status) return this.toMember(row);

    const losesOwner = isOwner && (removed.includes('owner') || status === 'DISABLED');
    const tenantId = this.cls.get('tenantId')!;
    await this.db.$transaction(async (tx) => {
      if (losesOwner) {
        const others = await tx.membership.count({
          where: {
            id: { not: row.id },
            status: 'ACTIVE',
            roles: { some: { role: { key: 'owner' } } },
          },
        });
        if (others === 0)
          throw new DomainError('CONFLICT', 'last owner', [{ path: 'id', issue: 'last_owner' }]);
      }
      const bumped = await tx.membership.updateMany({
        where: { id: row.id, permissionsVersion: change.version },
        data: { status, permissionsVersion: { increment: 1 } },
      });
      if (bumped.count !== 1) throw new DomainError('VERSION_CONFLICT');
      if (removed.length)
        await tx.membershipRole.deleteMany({
          where: {
            membershipId: row.id,
            roleId: {
              in: row.roles.filter((r) => removed.includes(r.role.key)).map((r) => r.role.id),
            },
          },
        });
      if (added.length) {
        const roles = await tx.role.findMany({
          where: { key: { in: added } },
          select: { id: true },
        });
        if (roles.length !== added.length) throw new DomainError('CONFLICT', 'role missing');
        await tx.membershipRole.createMany({
          data: roles.map((r) => ({ tenantId, membershipId: row.id, roleId: r.id })),
        });
      }
      await this.audit.record(
        {
          action: 'team.member_updated',
          entityType: 'Membership',
          entityId: row.id,
          before: { status: row.status, roles: current },
          after: { status, roles: next },
        },
        tx,
      );
    });
    await this.memberships.invalidate(tenantId, row.userId);
    if (status === 'DISABLED' && row.status !== 'DISABLED')
      await this.sessions.revokeUserSessions(row.userId, 'membership_disabled', { tenantId });

    const updated = (await this.db.membership.findFirst({
      where: { id: row.id },
      select: MEMBER_SELECT,
    })) as MemberRow;
    return this.toMember(updated);
  }

  async roles() {
    const me = this.me();
    const rows = await this.db.role.findMany({
      orderBy: { createdAt: 'asc' },
      select: { key: true, name: true, isSystem: true },
    });
    return {
      roles: rows.map((r) => {
        const key = RoleKeySchema.safeParse(r.key);
        return {
          ...r,
          experience: key.success ? ROLE_TEMPLATES[key.data].experience : null,
          grantable: canGrantRole(me, r.key),
        };
      }),
    };
  }

  private me(): MembershipInfo {
    const me = this.cls.get('membership');
    if (!me) throw new DomainError('FORBIDDEN', 'no membership');
    return me;
  }

  private toMember(r: MemberRow): TeamMember {
    return {
      id: r.id,
      name: r.user.name,
      email: r.user.email,
      phone: r.user.phone,
      status: r.status,
      roles: r.roles.map((x) => ({ key: x.role.key, name: x.role.name })),
      branchIds: r.branchIds,
      lastLoginAt: r.user.lastLoginAt?.toISOString() ?? null,
      version: r.permissionsVersion,
      isYou: r.userId === this.cls.get('userId'),
    };
  }
}
