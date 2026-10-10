import {
  type CreateTeacher,
  type CursorPage,
  decodeCursor,
  encodeCursor,
  newId,
  type Teacher,
  type TeacherListItem,
  type TeacherListQuery,
  type UpdateTeacher,
} from '@academybee/contracts';
import type { Prisma, TenantBoundClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';

import { AnalyticsService } from '../../core/analytics/analytics.service.js';
import { AuditService } from '../../core/audit/audit.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { scopedWhere } from '../../core/rbac/scope.js';
import { InvitationsService } from '../team/index.js';
import { ActivityService } from './activity.service.js';
import { teacherPolicy } from './people.policy.js';

const CursorKeys = z.object({ n: z.string(), id: z.uuid() });

const DETAIL_SELECT = {
  id: true,
  tenantId: true,
  fullName: true,
  email: true,
  phone: true,
  subjects: true,
  status: true,
  version: true,
  createdAt: true,
  membershipId: true,
  membership: { select: { status: true } },
  invitation: { select: { acceptedAt: true, revokedAt: true, expiresAt: true } },
  batches: {
    where: { batch: { status: 'ACTIVE' } },
    select: { batch: { select: { id: true, name: true, course: { select: { name: true } } } } },
  },
} as const satisfies Prisma.TeacherSelect;

type AccessRow = {
  membershipId: string | null;
  invitation: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date } | null;
};

/** MEMBER when linked to a membership; INVITED while an invitation is open; otherwise NONE. */
function accessOf(row: AccessRow): Teacher['access'] {
  if (row.membershipId) return 'MEMBER';
  const inv = row.invitation;
  if (inv && !inv.acceptedAt && !inv.revokedAt && inv.expiresAt > new Date()) return 'INVITED';
  return 'NONE';
}

/**
 * Teachers (UX §11, ARCHITECTURE §7.3): a profile per person who teaches — signed-in member,
 * invited by email (teacher role, C-67; the invitation links the profile on accept), or just a
 * name. Archived, never deleted (ADR-025): their classes and history keep pointing at them.
 */
@Injectable()
export class TeachersService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly invitations: InvitationsService,
    private readonly activity: ActivityService,
    private readonly analytics: AnalyticsService,
    private readonly audit: AuditService,
  ) {}

  async list(query: TeacherListQuery): Promise<CursorPage<TeacherListItem>> {
    const after = query.cursor ? decodeCursor(query.cursor, CursorKeys) : undefined;
    if (after === null) throw new DomainError('VALIDATION_FAILED', 'bad cursor');
    const rows = await this.db.teacher.findMany({
      where: {
        AND: [
          this.scope('teacher.read'),
          { status: query.status },
          query.q ? { fullName: { contains: query.q, mode: 'insensitive' } } : {},
          after
            ? { OR: [{ fullName: { gt: after.n } }, { fullName: after.n, id: { gt: after.id } }] }
            : {},
        ],
      },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
      select: {
        id: true,
        fullName: true,
        subjects: true,
        status: true,
        membershipId: true,
        invitation: { select: { acceptedAt: true, revokedAt: true, expiresAt: true } },
        _count: { select: { batches: { where: { batch: { status: 'ACTIVE' } } } } },
      },
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((r) => ({
        id: r.id,
        fullName: r.fullName,
        subjects: r.subjects,
        status: r.status,
        access: accessOf(r),
        batchCount: r._count.batches,
      })),
      nextCursor:
        rows.length > query.limit && last ? encodeCursor({ n: last.fullName, id: last.id }) : null,
    };
  }

  async get(id: string): Promise<Teacher> {
    const row = await this.db.teacher.findFirst({
      where: { AND: [{ id }, this.scope('teacher.read')] },
      select: DETAIL_SELECT,
    });
    if (!row) throw new DomainError('NOT_FOUND', 'teacher');
    const access = accessOf(row);
    return {
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      phone: row.phone,
      subjects: row.subjects,
      status: row.status,
      access,
      inviteExpiresAt: access === 'INVITED' ? row.invitation!.expiresAt.toISOString() : null,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      batches: row.batches.map((b) => ({
        id: b.batch.id,
        name: b.batch.name,
        courseName: b.batch.course.name,
      })),
    };
  }

  async create(input: CreateTeacher): Promise<Teacher> {
    const ctx = await this.context();
    let invitationId: string | null = null;
    let fullName: string;
    let email: string | null = null;
    let membershipId: string | null = null;
    if (input.mode === 'invite') {
      // Its own transaction, like onboarding's teacher step (C-92); revoked if the profile fails.
      const invitation = await this.invitations.create(
        { email: input.email!, roles: ['teacher'] },
        { inviteeName: input.fullName! },
      );
      invitationId = invitation.id;
      fullName = input.fullName!;
      email = input.email!;
    } else if (input.mode === 'member') {
      const member = await this.db.membership.findFirst({
        where: { id: input.membershipId!, status: { not: 'DISABLED' } },
        select: { id: true, user: { select: { name: true, email: true } } },
      });
      if (!member) throw new DomainError('NOT_FOUND', 'member');
      const taken = await this.db.teacher.findFirst({
        where: { membershipId: member.id },
        select: { id: true },
      });
      if (taken)
        throw new DomainError('CONFLICT', 'already a teacher', [
          { path: 'membershipId', issue: 'already_teacher' },
        ]);
      membershipId = member.id;
      fullName = member.user.name;
      email = member.user.email;
    } else {
      fullName = input.fullName!;
    }
    const id = newId();
    try {
      await this.db.$transaction(async (tx) => {
        await tx.teacher.create({
          data: {
            id,
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            membershipId,
            invitationId,
            fullName,
            email,
            phone: input.phone ?? null,
            subjects: input.subjects,
          },
        });
        await this.activity.record(tx, {
          tenantId: ctx.tenantId,
          entityType: 'TEACHER',
          entityId: id,
          type: 'teacher.created',
          data: { mode: input.mode },
        });
        await this.analytics.track(tx, 'teacher.created', { mode: input.mode });
      });
    } catch (error) {
      if (invitationId) await this.invitations.revoke(invitationId).catch(() => undefined);
      throw error;
    }
    return this.get(id);
  }

  async update(id: string, input: UpdateTeacher): Promise<Teacher> {
    await this.db.$transaction(async (tx) => {
      const row = await tx.teacher.findFirst({
        where: { AND: [{ id }, this.scope('teacher.manage')] },
        select: { tenantId: true, status: true },
      });
      if (!row) throw new DomainError('NOT_FOUND', 'teacher');
      const { version, ...fields } = input;
      const data: Prisma.TeacherUpdateManyMutationInput = {
        ...(fields.fullName !== undefined ? { fullName: fields.fullName } : {}),
        ...(fields.phone !== undefined ? { phone: fields.phone } : {}),
        ...(fields.subjects !== undefined ? { subjects: fields.subjects } : {}),
        ...(fields.status !== undefined ? { status: fields.status } : {}),
      };
      const changed = Object.keys(data);
      if (!changed.length) return;
      const updated = await tx.teacher.updateMany({
        where: { id, version },
        data: { ...data, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
      const statusChange = fields.status && fields.status !== row.status ? fields.status : null;
      if (statusChange)
        await this.audit.record(
          {
            action: statusChange === 'ARCHIVED' ? 'teacher.archived' : 'teacher.restored',
            entityType: 'Teacher',
            entityId: id,
          },
          tx,
        );
      await this.activity.record(tx, {
        tenantId: row.tenantId,
        entityType: 'TEACHER',
        entityId: id,
        type: statusChange
          ? statusChange === 'ARCHIVED'
            ? 'teacher.archived'
            : 'teacher.restored'
          : 'teacher.updated',
        data: { fields: changed.join(',') },
      });
    });
    return this.get(id);
  }

  /** Team members (staff) who don't have a teacher profile yet. */
  async linkableMembers() {
    const rows = await this.db.membership.findMany({
      where: {
        status: { not: 'DISABLED' },
        teachers: { none: {} },
        roles: { some: { role: { key: { notIn: ['parent', 'student'] } } } },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: { id: true, user: { select: { name: true, email: true } } },
    });
    return {
      items: rows.map((m) => ({ membershipId: m.id, name: m.user.name, email: m.user.email })),
    };
  }

  /** The teacher exists in the caller's `teacher.read` scope (for sub-resources), else 404. */
  async assertReadable(id: string): Promise<void> {
    const row = await this.db.teacher.findFirst({
      where: { AND: [{ id }, this.scope('teacher.read')] },
      select: { id: true },
    });
    if (!row) throw new DomainError('NOT_FOUND', 'teacher');
  }

  private scope(capability: 'teacher.read' | 'teacher.manage') {
    return scopedWhere(this.cls, capability, teacherPolicy) as Prisma.TeacherWhereInput;
  }

  private async context() {
    const tenantId = this.cls.get('tenantId');
    const membership = this.cls.get('membership');
    if (!tenantId || !membership) throw new DomainError('UNAUTHENTICATED');
    const branch = membership.branchIds.length
      ? await this.db.branch.findFirst({
          where: { id: membership.branchIds[0]! },
          select: { id: true },
        })
      : await this.db.branch.findFirst({ where: { isDefault: true }, select: { id: true } });
    if (!branch) throw new DomainError('NOT_FOUND', 'academy');
    return { tenantId, branchId: branch.id };
  }
}
