import { type Course, newId } from '@academybee/contracts';
import type { Prisma, TenantBoundClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { scopedWhere } from '../../core/rbac/scope.js';
import { coursePolicy } from './scheduling.policy.js';

const SELECT = {
  id: true,
  name: true,
  description: true,
  status: true,
  version: true,
  levels: {
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, sortOrder: true },
  },
  _count: { select: { batches: { where: { status: 'ACTIVE' } } } },
} satisfies Prisma.CourseSelect;

type Row = Prisma.CourseGetPayload<{ select: typeof SELECT }>;

const toCourse = (r: Row): Course => ({
  id: r.id,
  name: r.name,
  description: r.description,
  status: r.status,
  version: r.version,
  levels: r.levels,
  batchCount: r._count.batches,
});

/** Courses and their levels (PRD v3 §9; label configurable, ADR-029). */
@Injectable()
export class CoursesService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  private scope(capability: 'course.read' | 'course.manage'): Prisma.CourseWhereInput {
    return scopedWhere(this.cls, capability, coursePolicy);
  }

  async list(status: 'ACTIVE' | 'ARCHIVED'): Promise<{ items: Course[] }> {
    const rows = await this.db.course.findMany({
      where: { AND: [this.scope('course.read'), { status }] },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 500,
      select: SELECT,
    });
    return { items: rows.map(toCourse) };
  }

  async get(id: string): Promise<Course> {
    const row = await this.db.course.findFirst({
      where: { AND: [{ id }, this.scope('course.read')] },
      select: SELECT,
    });
    if (!row) throw new DomainError('NOT_FOUND', 'course');
    return toCourse(row);
  }

  async create(input: { name: string; description?: string | undefined; levels: string[] }) {
    const tenantId = this.cls.get('tenantId')!;
    const id = newId();
    await this.db.$transaction(async (tx) => {
      await tx.course.create({
        data: { id, tenantId, name: input.name, description: input.description ?? null },
      });
      if (input.levels.length)
        await tx.courseLevel.createMany({
          data: input.levels.map((name, i) => ({
            id: newId(),
            tenantId,
            courseId: id,
            name,
            sortOrder: i,
          })),
        });
    });
    return this.get(id);
  }

  async update(
    id: string,
    input: {
      version: number;
      name?: string | undefined;
      description?: string | null | undefined;
      status?: 'ACTIVE' | 'ARCHIVED' | undefined;
    },
  ): Promise<Course> {
    await this.db.$transaction(async (tx) => {
      const course = await tx.course.findFirst({
        where: { AND: [{ id }, this.scope('course.manage')] },
        select: { id: true, _count: { select: { batches: { where: { status: 'ACTIVE' } } } } },
      });
      if (!course) throw new DomainError('NOT_FOUND', 'course');
      if (input.status === 'ARCHIVED' && course._count.batches > 0)
        throw new DomainError('CONFLICT', 'course has active batches', [
          { path: 'status', issue: 'has_active_batches' },
        ]);
      const updated = await tx.course.updateMany({
        where: { id, version: input.version },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
    });
    return this.get(id);
  }

  async addLevel(courseId: string, name: string): Promise<Course> {
    await this.db.$transaction(async (tx) => {
      const course = await tx.course.findFirst({
        where: { AND: [{ id: courseId }, this.scope('course.manage')] },
        select: { tenantId: true, _count: { select: { levels: true } } },
      });
      if (!course) throw new DomainError('NOT_FOUND', 'course');
      if (course._count.levels >= 30)
        throw new DomainError('VALIDATION_FAILED', 'too many levels', [
          { path: 'name', issue: 'too_many' },
        ]);
      await tx.courseLevel.create({
        data: {
          id: newId(),
          tenantId: course.tenantId,
          courseId,
          name,
          sortOrder: course._count.levels,
        },
      });
    });
    return this.get(courseId);
  }

  async updateLevel(
    courseId: string,
    levelId: string,
    input: { name?: string | undefined; sortOrder?: number | undefined },
  ): Promise<Course> {
    const level = await this.db.courseLevel.findFirst({
      where: { id: levelId, courseId, course: this.scope('course.manage') },
      select: { id: true },
    });
    if (!level) throw new DomainError('NOT_FOUND', 'level');
    await this.db.courseLevel.update({
      where: { id: levelId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
    return this.get(courseId);
  }
}
