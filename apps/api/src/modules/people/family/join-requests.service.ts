import { type JoinRequest, newId, type ParentRelationship } from '@academybee/contracts';
import type { Prisma, TenantBoundClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { AnalyticsService } from '../../../core/analytics/analytics.service.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import type { RequestContext } from '../../../core/context/request-context.js';
import { TENANT_DB } from '../../../core/database/database.module.js';
import { DomainError } from '../../../core/errors/domain-error.js';
import { scopedWhere } from '../../../core/rbac/scope.js';
import { ActivityService } from '../activity.service.js';
import { parentPolicy, studentPolicy } from '../people.policy.js';
import { ParentAccessService } from './parent-access.service.js';

const DECIDED_DAYS = 30;

/**
 * Join requests (G-31 §3, ADR-039): parents who asked to join from the Family Hub without a match.
 * Staff with `parent.manage` approve by linking the requester to the right student(s) — as an
 * existing parent record or a new one — or reject. Approval creates the parent's membership as
 * INVITED; it becomes ACTIVE only with the parent's consent in the hub (C-102, C-107).
 */
@Injectable()
export class JoinRequestsService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly access: ParentAccessService,
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
  ) {}

  /** Pending first (oldest first), then decisions from the last 30 days. */
  async list(): Promise<{ items: JoinRequest[] }> {
    const rows = await this.db.joinRequest.findMany({
      where: {
        OR: [
          { status: 'PENDING' },
          { reviewedAt: { gt: new Date(Date.now() - DECIDED_DAYS * 86_400_000) } },
        ],
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });
    const phones = rows.map((r) => r.phone).filter((v): v is string => !!v);
    const emails = rows.map((r) => r.email).filter((v): v is string => !!v);
    const matches =
      phones.length || emails.length
        ? await this.db.parent.findMany({
            where: {
              AND: [
                { status: 'ACTIVE' },
                { OR: [{ phone: { in: phones } }, { email: { in: emails } }] },
                scopedWhere(this.cls, 'parent.read', parentPolicy) as Prisma.ParentWhereInput,
              ],
            },
            select: {
              id: true,
              fullName: true,
              phone: true,
              email: true,
              children: { select: { student: { select: { fullName: true } } } },
            },
          })
        : [];
    return {
      items: rows.map((r) => ({
        id: r.id,
        parentName: r.parentName,
        phone: r.phone,
        email: r.email,
        childName: r.childName,
        message: r.message,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        matches:
          r.status === 'PENDING'
            ? matches
                .filter((m) => (r.phone && m.phone === r.phone) || (r.email && m.email === r.email))
                .map((m) => ({
                  id: m.id,
                  fullName: m.fullName,
                  children: m.children.map((c) => c.student.fullName),
                }))
            : [],
      })),
    };
  }

  async approve(
    id: string,
    input: {
      studentIds: string[];
      parentId?: string | undefined;
      relationship: ParentRelationship;
    },
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const request = await tx.joinRequest.findFirst({ where: { id } });
      if (!request) throw new DomainError('NOT_FOUND', 'join request');
      if (request.status !== 'PENDING')
        throw new DomainError('INVALID_STATE_TRANSITION', `join request ${request.status}`);
      const students = await tx.student.findMany({
        where: {
          AND: [
            { id: { in: input.studentIds }, archivedAt: null },
            scopedWhere(this.cls, 'student.update', studentPolicy) as Prisma.StudentWhereInput,
          ],
        },
        select: { id: true },
      });
      if (students.length !== new Set(input.studentIds).size)
        throw new DomainError('NOT_FOUND', 'student');
      let parentId = input.parentId;
      if (parentId) {
        const parent = await tx.parent.findFirst({
          where: {
            AND: [
              { id: parentId, status: 'ACTIVE' },
              scopedWhere(this.cls, 'parent.manage', parentPolicy) as Prisma.ParentWhereInput,
            ],
          },
          select: { userId: true },
        });
        if (!parent) throw new DomainError('NOT_FOUND', 'parent');
        if (parent.userId && parent.userId !== request.userId)
          throw new DomainError('CONFLICT', 'parent has another account', [
            { path: 'parentId', issue: 'other_account' },
          ]);
        await tx.parent.update({ where: { id: parentId }, data: { userId: request.userId } });
      } else {
        parentId = newId();
        await tx.parent.create({
          data: {
            id: parentId,
            tenantId: request.tenantId,
            fullName: request.parentName,
            phone: request.phone,
            email: request.email,
            whatsappCapable: false,
            userId: request.userId,
            createdById: this.cls.get('membership')?.id ?? null,
          },
        });
      }
      const existing = await tx.parentStudent.findMany({
        where: { parentId, studentId: { in: input.studentIds } },
        select: { studentId: true },
      });
      for (const s of students.filter((x) => !existing.some((e) => e.studentId === x.id))) {
        const others = await tx.parentStudent.count({ where: { studentId: s.id } });
        await tx.parentStudent.create({
          data: {
            id: newId(),
            tenantId: request.tenantId,
            parentId,
            studentId: s.id,
            relationship: input.relationship,
            isPrimaryContact: others === 0,
          },
        });
        await this.activity.record(tx, {
          tenantId: request.tenantId,
          entityType: 'STUDENT',
          entityId: s.id,
          type: 'parent.linked',
          data: { relationship: input.relationship },
        });
      }
      await this.access.ensureMembership(tx, request.tenantId, request.userId);
      await tx.joinRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          parentId,
          reviewedById: this.cls.get('membership')?.id ?? null,
          reviewedAt: new Date(),
        },
      });
      await this.audit.record(
        {
          action: 'join_request.approved',
          entityType: 'JoinRequest',
          entityId: id,
          metadata: { parentId },
        },
        tx,
      );
      await this.analytics.track(tx, 'family.join_decided', { decision: 'APPROVED' });
    });
  }

  async reject(id: string, reason: string | undefined): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const updated = await tx.joinRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          reviewedById: this.cls.get('membership')?.id ?? null,
          reviewedAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        const exists = await tx.joinRequest.findFirst({ where: { id }, select: { id: true } });
        throw exists
          ? new DomainError('INVALID_STATE_TRANSITION', 'join request decided')
          : new DomainError('NOT_FOUND', 'join request');
      }
      await this.audit.record(
        {
          action: 'join_request.rejected',
          entityType: 'JoinRequest',
          entityId: id,
          ...(reason ? { metadata: { reason } } : {}),
        },
        tx,
      );
      await this.analytics.track(tx, 'family.join_decided', { decision: 'REJECTED' });
    });
  }
}
