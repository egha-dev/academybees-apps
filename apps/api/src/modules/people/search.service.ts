import { SEARCH_LIMIT_PER_TYPE, type SearchResults } from '@academybee/contracts';
import type { Prisma, TenantBoundClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { scopedWhere } from '../../core/rbac/scope.js';
import { parentPolicy, studentPolicy, teacherPolicy } from './people.policy.js';
import { searchWhere } from './students.service.js';

/**
 * The command palette's search (UX §9.1, ADR-026, C-105): students, parents and teachers the
 * caller may see — each type through its own scope policy, so search never shows more than the
 * lists do — up to 5 of each. A type the role can't read comes back empty. Archived students are
 * left out (C-108). Batches join in Phase 5.
 */
@Injectable()
export class SearchService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  async search(q: string): Promise<SearchResults> {
    const can = (capability: string) =>
      (this.cls.get('membership')?.capabilities as Record<string, unknown> | undefined)?.[
        capability
      ] !== undefined;
    const take = SEARCH_LIMIT_PER_TYPE;
    const digits = q.replace(/\D/g, '');
    const studentScope = can('student.read')
      ? (scopedWhere(this.cls, 'student.read', studentPolicy) as Prisma.StudentWhereInput)
      : null;
    const [students, parents, teachers] = await Promise.all([
      studentScope
        ? this.db.student.findMany({
            where: { AND: [studentScope, { archivedAt: null }, searchWhere(q)] },
            orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
            take,
            select: { id: true, fullName: true, admissionNo: true, status: true, archivedAt: true },
          })
        : [],
      can('parent.read')
        ? this.db.parent.findMany({
            where: {
              AND: [
                scopedWhere(this.cls, 'parent.read', parentPolicy) as Prisma.ParentWhereInput,
                { status: 'ACTIVE' },
                {
                  OR: [
                    { fullName: { contains: q, mode: 'insensitive' } },
                    ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
                    ...(q.includes('@') ? [{ email: { startsWith: q.toLowerCase() } }] : []),
                  ],
                },
              ],
            },
            orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
            take,
            select: {
              id: true,
              fullName: true,
              children: {
                where: studentScope
                  ? { student: { AND: [studentScope, { archivedAt: null }] } }
                  : { id: '' },
                orderBy: { createdAt: 'asc' },
                take: 1,
                select: { student: { select: { id: true, fullName: true } } },
              },
            },
          })
        : [],
      can('teacher.read')
        ? this.db.teacher.findMany({
            where: {
              AND: [
                scopedWhere(this.cls, 'teacher.read', teacherPolicy) as Prisma.TeacherWhereInput,
                { status: 'ACTIVE', fullName: { contains: q, mode: 'insensitive' } },
              ],
            },
            orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
            take,
            select: { id: true, fullName: true },
          })
        : [],
    ]);
    const results: SearchResults = {
      students: students.map((s) => ({
        id: s.id,
        fullName: s.fullName,
        admissionNo: s.admissionNo,
        status: s.status,
        archived: s.archivedAt !== null,
      })),
      parents: parents.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        studentId: p.children[0]?.student.id ?? null,
        studentName: p.children[0]?.student.fullName ?? null,
      })),
      teachers,
    };
    // No analytics event here: search runs as the user types, and each event is an outbox write.
    return results;
  }
}
