import {
  type Batch,
  type BatchListItem,
  type BatchListQuery,
  type CursorPage,
  decodeCursor,
  encodeCursor,
  localDate,
  newId,
} from '@academybee/contracts';
import type { Prisma, TenantBoundClient, TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';

import { ActivityService } from '../../core/activity/activity.service.js';
import { AnalyticsService } from '../../core/analytics/analytics.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { scopeFor, scopedWhere } from '../../core/rbac/scope.js';
import { batchLoads } from './batch-load.js';
import { batchPolicy } from './scheduling.policy.js';

const CursorKeys = z.object({ n: z.string(), id: z.uuid() });
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const SELECT = {
  id: true,
  name: true,
  courseId: true,
  course: { select: { name: true } },
  levelId: true,
  level: { select: { name: true } },
  branchId: true,
  status: true,
  capacity: true,
  startsOn: true,
  endsOn: true,
  version: true,
  createdAt: true,
  // Display names only; teachers themselves are managed by the people module (C-122).
  teachers: {
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    select: { teacherId: true, isPrimary: true, teacher: { select: { fullName: true } } },
  },
} satisfies Prisma.BatchSelect;
type Row = Prisma.BatchGetPayload<{ select: typeof SELECT }>;

export type BatchCapability = 'batch.read' | 'batch.manage' | 'batch.enrol';

/**
 * Batches (PRD v3 §9, UX §11.5): list with per-day load (C-121), workspace header, create/edit,
 * teachers. Students and their enrolments are the people module's (C-122); the weekly pattern and
 * sessions come with S3.
 */
@Injectable()
export class BatchesService {
  constructor(
    @Inject(TENANT_DB) readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly activity: ActivityService,
    private readonly analytics: AnalyticsService,
  ) {}

  scope(capability: BatchCapability): Prisma.BatchWhereInput {
    return scopedWhere(this.cls, capability, batchPolicy);
  }

  /** The academy's "today" (C-119). */
  async today(db: Pick<TransactionClient, 'tenant'> = this.db): Promise<string> {
    const t = await db.tenant.findFirst({ select: { timezone: true } });
    return localDate(new Date(), t?.timezone ?? 'Asia/Kolkata');
  }

  /** A batch in the caller's scope for `capability`, or 404. */
  async find(
    db: Pick<TransactionClient, 'batch'>,
    id: string,
    capability: BatchCapability,
  ): Promise<{
    id: string;
    tenantId: string;
    branchId: string;
    capacity: number | null;
    status: 'ACTIVE' | 'ARCHIVED';
  }> {
    const batch = await db.batch.findFirst({
      where: { AND: [{ id }, this.scope(capability)] },
      select: { id: true, tenantId: true, branchId: true, capacity: true, status: true },
    });
    if (!batch) throw new DomainError('NOT_FOUND', 'batch');
    return batch;
  }

  async list(query: BatchListQuery): Promise<CursorPage<BatchListItem>> {
    const after = query.cursor ? decodeCursor(query.cursor, CursorKeys) : undefined;
    if (after === null) throw new DomainError('VALIDATION_FAILED', 'bad cursor');
    const rows = await this.db.batch.findMany({
      where: {
        AND: [
          this.scope('batch.read'),
          { status: query.status },
          query.courseId ? { courseId: query.courseId } : {},
          query.branchId ? { branchId: query.branchId } : {},
          query.teacherId ? { teachers: { some: { teacherId: query.teacherId } } } : {},
          query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {},
          after ? { OR: [{ name: { gt: after.n } }, { name: after.n, id: { gt: after.id } }] } : {},
        ],
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
      select: SELECT,
    });
    const page = rows.slice(0, query.limit);
    const items = await this.decorate(page);
    const last = page.at(-1);
    return {
      items,
      nextCursor:
        rows.length > query.limit && last ? encodeCursor({ n: last.name, id: last.id }) : null,
    };
  }

  async get(id: string): Promise<Batch> {
    const row = await this.db.batch.findFirst({
      where: { AND: [{ id }, this.scope('batch.read')] },
      select: SELECT,
    });
    if (!row) throw new DomainError('NOT_FOUND', 'batch');
    const today = await this.today();
    const [item] = await this.decorate([row], today);
    const load = (await batchLoads(this.db, [id], today)).get(id)!;
    return {
      ...item!,
      levelId: row.levelId,
      startsOn: day(row.startsOn),
      endsOn: day(row.endsOn),
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      dayLoad: load.dayLoad,
    };
  }

  private async decorate(rows: Row[], on?: string): Promise<BatchListItem[]> {
    if (!rows.length) return [];
    const today = on ?? (await this.today());
    const ids = rows.map((r) => r.id);
    const [loads, next] = await Promise.all([
      batchLoads(this.db, ids, today),
      this.db.classSession.groupBy({
        by: ['batchId'],
        where: { batchId: { in: ids }, status: 'SCHEDULED', startsAt: { gt: new Date() } },
        _min: { startsAt: true },
      }),
    ]);
    return rows.map((r) => {
      const load = loads.get(r.id)!;
      const fullest = [...load.dayLoad].sort((a, b) => b.students - a.students)[0] ?? null;
      return {
        id: r.id,
        name: r.name,
        courseId: r.courseId,
        courseName: r.course.name,
        levelName: r.level?.name ?? null,
        branchId: r.branchId,
        status: r.status,
        capacity: r.capacity,
        enrolled: load.enrolled,
        weekdays: load.weekdays,
        fullestDay: fullest,
        teachers: r.teachers.map((t) => ({
          teacherId: t.teacherId,
          fullName: t.teacher.fullName,
          isPrimary: t.isPrimary,
        })),
        nextSessionAt: next.find((n) => n.batchId === r.id)?._min.startsAt?.toISOString() ?? null,
      };
    });
  }

  async create(input: {
    name: string;
    courseId: string;
    levelId?: string | null | undefined;
    branchId?: string | undefined;
    capacity?: number | null | undefined;
    startsOn?: string | null | undefined;
    endsOn?: string | null | undefined;
    teacherIds: string[];
  }): Promise<Batch> {
    const id = newId();
    await this.db.$transaction(async (tx) => {
      const tenantId = this.cls.get('tenantId')!;
      const course = await tx.course.findFirst({
        where: { id: input.courseId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!course) throw new DomainError('NOT_FOUND', 'course');
      if (input.levelId) {
        const level = await tx.courseLevel.findFirst({
          where: { id: input.levelId, courseId: input.courseId },
          select: { id: true },
        });
        if (!level) throw new DomainError('NOT_FOUND', 'level');
      }
      const branchId = await this.branchFor(tx, input.branchId);
      await tx.batch.create({
        data: {
          id,
          tenantId,
          branchId,
          courseId: input.courseId,
          levelId: input.levelId ?? null,
          name: input.name,
          capacity: input.capacity ?? null,
          startsOn: input.startsOn ? new Date(`${input.startsOn}T00:00:00Z`) : null,
          endsOn: input.endsOn ? new Date(`${input.endsOn}T00:00:00Z`) : null,
        },
      });
      await this.writeTeachers(
        tx,
        tenantId,
        id,
        input.teacherIds.map((teacherId, i) => ({ teacherId, isPrimary: i === 0 })),
      );
      await this.activity.record(tx, {
        tenantId,
        entityType: 'BATCH',
        entityId: id,
        type: 'batch.created',
      });
      await this.analytics.track(tx, 'batch.created', { source: 'manual' });
    });
    return this.get(id);
  }

  /** The branch for a new batch: the given one if the caller may use it, else the default. */
  private async branchFor(tx: TransactionClient, branchId: string | undefined): Promise<string> {
    const { scope, ctx } = scopeFor(this.cls, 'batch.manage');
    const limited = scope === 'BRANCH' && ctx.branchIds.length > 0;
    const branch = await tx.branch.findFirst({
      where: branchId
        ? { id: branchId }
        : limited
          ? { id: { in: [...ctx.branchIds] } }
          : { isDefault: true },
      orderBy: { isDefault: 'desc' },
      select: { id: true },
    });
    if (!branch || (limited && !ctx.branchIds.includes(branch.id)))
      throw new DomainError('NOT_FOUND', 'branch');
    return branch.id;
  }

  async update(
    id: string,
    input: {
      version: number;
      name?: string | undefined;
      levelId?: string | null | undefined;
      capacity?: number | null | undefined;
      startsOn?: string | null | undefined;
      endsOn?: string | null | undefined;
      status?: 'ACTIVE' | 'ARCHIVED' | undefined;
    },
  ): Promise<Batch> {
    await this.db.$transaction(async (tx) => {
      const batch = await tx.batch.findFirst({
        where: { AND: [{ id }, this.scope('batch.manage')] },
        select: { tenantId: true, courseId: true, startsOn: true, endsOn: true },
      });
      if (!batch) throw new DomainError('NOT_FOUND', 'batch');
      if (input.levelId) {
        const level = await tx.courseLevel.findFirst({
          where: { id: input.levelId, courseId: batch.courseId },
          select: { id: true },
        });
        if (!level) throw new DomainError('NOT_FOUND', 'level');
      }
      const startsOn = input.startsOn !== undefined ? input.startsOn : day(batch.startsOn);
      const endsOn = input.endsOn !== undefined ? input.endsOn : day(batch.endsOn);
      if (startsOn && endsOn && endsOn < startsOn)
        throw new DomainError('VALIDATION_FAILED', 'ends before start', [
          { path: 'endsOn', issue: 'ends_before_start' },
        ]);
      const updated = await tx.batch.updateMany({
        where: { id, version: input.version },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.levelId !== undefined ? { levelId: input.levelId } : {}),
          ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
          ...(input.startsOn !== undefined
            ? { startsOn: input.startsOn ? new Date(`${input.startsOn}T00:00:00Z`) : null }
            : {}),
          ...(input.endsOn !== undefined
            ? { endsOn: input.endsOn ? new Date(`${input.endsOn}T00:00:00Z`) : null }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
      await this.activity.record(tx, {
        tenantId: batch.tenantId,
        entityType: 'BATCH',
        entityId: id,
        type: input.status === 'ARCHIVED' ? 'batch.archived' : 'batch.updated',
        data: {
          fields: Object.keys(input)
            .filter((k) => k !== 'version' && input[k as keyof typeof input] !== undefined)
            .join(','),
        },
      });
    });
    return this.get(id);
  }

  async setTeachers(
    id: string,
    teachers: { teacherId: string; isPrimary: boolean }[],
  ): Promise<Batch> {
    await this.db.$transaction(async (tx) => {
      const batch = await this.find(tx, id, 'batch.manage');
      await tx.batchTeacher.deleteMany({ where: { batchId: id } });
      const primary = teachers.findIndex((t) => t.isPrimary);
      await this.writeTeachers(
        tx,
        batch.tenantId,
        id,
        teachers.map((t, i) => ({
          teacherId: t.teacherId,
          isPrimary: i === (primary < 0 ? 0 : primary),
        })),
      );
      await this.activity.record(tx, {
        tenantId: batch.tenantId,
        entityType: 'BATCH',
        entityId: id,
        type: 'batch.teachers_changed',
        data: { count: teachers.length },
      });
    });
    return this.get(id);
  }

  private async writeTeachers(
    tx: TransactionClient,
    tenantId: string,
    batchId: string,
    teachers: { teacherId: string; isPrimary: boolean }[],
  ): Promise<void> {
    const unique = teachers.filter(
      (t, i) => teachers.findIndex((x) => x.teacherId === t.teacherId) === i,
    );
    if (!unique.length) return;
    const found = await tx.teacher.count({
      where: { id: { in: unique.map((t) => t.teacherId) }, status: 'ACTIVE' },
    });
    if (found !== unique.length) throw new DomainError('NOT_FOUND', 'teacher');
    await tx.batchTeacher.createMany({
      data: unique.map((t) => ({
        tenantId,
        batchId,
        teacherId: t.teacherId,
        isPrimary: t.isPrimary,
      })),
    });
  }
}
