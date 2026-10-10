import {
  type LinkParent,
  newId,
  type Parent,
  type ParentRelationship,
  type UpdateParentLinkSchema,
  type UpdateParentSchema,
} from '@academybee/contracts';
import type { Prisma, TenantBoundClient, TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { z } from 'zod';

import { AnalyticsService } from '../../core/analytics/analytics.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { scopedWhere } from '../../core/rbac/scope.js';
import { ActivityService } from './activity.service.js';
import { parentPolicy, studentPolicy } from './people.policy.js';

/**
 * Parents and their links to students (PRD v3.1 §9: one parent with many children, a child with
 * many parents; G-05). Parents are reached through Student 360 (C-106); dedupe is a suggestion,
 * never an automatic merge. Unlinking removes the link row (the history stays in the timeline);
 * parents themselves are never deleted (ADR-025).
 */
@Injectable()
export class ParentsService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly activity: ActivityService,
    private readonly analytics: AnalyticsService,
  ) {}

  /** Link an existing parent or create one, inside the caller's transaction. */
  async link(
    tx: TransactionClient,
    input: { tenantId: string; studentId: string; link: LinkParent },
  ): Promise<{ linkId: string; parentId: string }> {
    const { link } = input;
    let parentId: string;
    const existing = Boolean(link.parentId);
    if (link.parentId) {
      const parent = await tx.parent.findFirst({
        where: {
          AND: [{ id: link.parentId, status: 'ACTIVE' }, this.parentScope('parent.manage')],
        },
        select: { id: true },
      });
      if (!parent) throw new DomainError('NOT_FOUND', 'parent');
      parentId = parent.id;
      const already = await tx.parentStudent.findFirst({
        where: { parentId, studentId: input.studentId },
        select: { id: true },
      });
      if (already)
        throw new DomainError('CONFLICT', 'parent already linked', [
          { path: 'parentId', issue: 'already_linked' },
        ]);
    } else {
      const details = link.parent;
      if (!details) throw new DomainError('VALIDATION_FAILED', 'parent details');
      parentId = newId();
      await tx.parent.create({
        data: {
          id: parentId,
          tenantId: input.tenantId,
          fullName: details.fullName,
          phone: details.phone ?? null,
          email: details.email ?? null,
          occupation: details.occupation ?? null,
          // Not assumed: WhatsApp needs the parent's opt-in (G-07).
          whatsappCapable: false,
          createdById: this.cls.get('membership')?.id ?? null,
        },
      });
    }
    const others = await tx.parentStudent.count({ where: { studentId: input.studentId } });
    // The first parent of a student is their primary contact.
    const primary = link.isPrimaryContact || others === 0;
    if (primary && others > 0)
      await tx.parentStudent.updateMany({
        where: { studentId: input.studentId },
        data: { isPrimaryContact: false },
      });
    const linkId = newId();
    await tx.parentStudent.create({
      data: {
        id: linkId,
        tenantId: input.tenantId,
        parentId,
        studentId: input.studentId,
        relationship: link.relationship,
        isPrimaryContact: primary,
        pickupAuthorised: link.pickupAuthorised,
      },
    });
    await this.activity.record(tx, {
      tenantId: input.tenantId,
      entityType: 'STUDENT',
      entityId: input.studentId,
      type: 'parent.linked',
      data: { relationship: link.relationship },
    });
    await this.analytics.track(tx, 'parent.linked', { existing });
    return { linkId, parentId };
  }

  async updateLink(
    studentId: string,
    linkId: string,
    input: z.infer<typeof UpdateParentLinkSchema>,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const link = await this.findLink(tx, studentId, linkId);
      if (input.isPrimaryContact === true)
        await tx.parentStudent.updateMany({
          where: { studentId, id: { not: link.id } },
          data: { isPrimaryContact: false },
        });
      await tx.parentStudent.update({
        where: { id: link.id },
        data: {
          ...(input.relationship ? { relationship: input.relationship } : {}),
          ...(input.isPrimaryContact !== undefined
            ? { isPrimaryContact: input.isPrimaryContact }
            : {}),
          ...(input.pickupAuthorised !== undefined
            ? { pickupAuthorised: input.pickupAuthorised }
            : {}),
        },
      });
    });
  }

  /**
   * Unlink a parent from a student (Undo relinks with the returned details, C-108). The parent
   * record stays, with their other children.
   */
  async unlink(
    studentId: string,
    linkId: string,
  ): Promise<{ parentId: string; relationship: ParentRelationship }> {
    return this.db.$transaction(async (tx) => {
      const link = await this.findLink(tx, studentId, linkId);
      await tx.parentStudent.delete({ where: { id: link.id } });
      if (link.isPrimaryContact) {
        const next = await tx.parentStudent.findFirst({
          where: { studentId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (next)
          await tx.parentStudent.update({
            where: { id: next.id },
            data: { isPrimaryContact: true },
          });
      }
      await this.activity.record(tx, {
        tenantId: link.tenantId,
        entityType: 'STUDENT',
        entityId: studentId,
        type: 'parent.unlinked',
        data: { relationship: link.relationship },
      });
      return { parentId: link.parentId, relationship: link.relationship as ParentRelationship };
    });
  }

  async get(id: string): Promise<Parent> {
    const parent = await this.db.parent.findFirst({
      where: { AND: [{ id }, this.parentScope('parent.read')] },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        occupation: true,
        whatsappCapable: true,
        version: true,
        children: {
          where: { student: this.studentScope() },
          orderBy: { createdAt: 'asc' },
          select: {
            relationship: true,
            student: { select: { id: true, fullName: true, admissionNo: true, status: true } },
          },
        },
      },
    });
    if (!parent) throw new DomainError('NOT_FOUND', 'parent');
    return {
      id: parent.id,
      fullName: parent.fullName,
      phone: parent.phone,
      email: parent.email,
      occupation: parent.occupation,
      whatsappCapable: parent.whatsappCapable,
      version: parent.version,
      children: parent.children.map((c) => ({
        studentId: c.student.id,
        fullName: c.student.fullName,
        admissionNo: c.student.admissionNo,
        status: c.student.status,
        relationship: c.relationship as ParentRelationship,
      })),
    };
  }

  async update(id: string, input: z.infer<typeof UpdateParentSchema>): Promise<Parent> {
    await this.db.$transaction(async (tx) => {
      const parent = await tx.parent.findFirst({
        where: { AND: [{ id }, this.parentScope('parent.manage')] },
        select: { id: true, tenantId: true, version: true },
      });
      if (!parent) throw new DomainError('NOT_FOUND', 'parent');
      const { version, ...fields } = input;
      const changed = Object.keys(fields).filter(
        (k) => fields[k as keyof typeof fields] !== undefined,
      );
      const updated = await tx.parent.updateMany({
        where: { id, version },
        data: {
          ...(stripUndefined(fields) as Prisma.ParentUpdateManyMutationInput),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
      await this.activity.record(tx, {
        tenantId: parent.tenantId,
        entityType: 'PARENT',
        entityId: id,
        type: 'parent.updated',
        data: { fields: changed.join(',') },
      });
    });
    return this.get(id);
  }

  /** "Use existing" suggestions (C-106): same phone or email in this academy, within scope. */
  async duplicates(query: { phone?: string | undefined; email?: string | null | undefined }) {
    const or = [
      ...(query.phone ? [{ phone: query.phone }] : []),
      ...(query.email ? [{ email: query.email }] : []),
    ];
    if (!or.length) return { items: [] };
    const rows = await this.db.parent.findMany({
      where: { AND: [{ status: 'ACTIVE', OR: or }, this.parentScope('parent.read')] },
      take: 5,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        _count: { select: { children: true } },
      },
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        fullName: r.fullName,
        phone: r.phone,
        email: r.email,
        childrenCount: r._count.children,
      })),
    };
  }

  private async findLink(tx: TransactionClient, studentId: string, linkId: string) {
    const link = await tx.parentStudent.findFirst({
      where: {
        id: linkId,
        studentId,
        student: { AND: [this.studentScope('student.update'), { archivedAt: null }] },
      },
      select: {
        id: true,
        tenantId: true,
        parentId: true,
        relationship: true,
        isPrimaryContact: true,
      },
    });
    if (!link) throw new DomainError('NOT_FOUND', 'parent link');
    return link;
  }

  private parentScope(capability: 'parent.read' | 'parent.manage') {
    return scopedWhere(this.cls, capability, parentPolicy);
  }

  private studentScope(capability: 'student.read' | 'student.update' = 'student.read') {
    return scopedWhere(this.cls, capability, studentPolicy);
  }
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
