import { z } from 'zod';

import { PhoneSchema } from './onboarding.js';
import { CursorPageQuerySchema, cursorPageSchema } from './pagination.js';
import { StudentStatusSchema } from './people.js';
import { PersonNameSchema } from './students.js';

/**
 * Teachers (Phase 4 S4, UX §11 "Teachers") and the scope-aware search behind the command palette
 * (UX §9.1, ADR-026, C-105).
 */

const Email = z.string().trim().toLowerCase().max(320).pipe(z.email());
const Subjects = z.array(z.string().trim().min(1).max(60)).max(10);

export const TEACHER_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export const TeacherStatusSchema = z.enum(TEACHER_STATUSES);

/** How the teacher signs in: a member of the team, invited (pending), or not at all (name only). */
export const TEACHER_ACCESS = ['MEMBER', 'INVITED', 'NONE'] as const;
export const TeacherAccessSchema = z.enum(TEACHER_ACCESS);

export const TeacherListQuerySchema = CursorPageQuerySchema.extend({
  q: z.string().trim().min(2).max(60).optional(),
  status: TeacherStatusSchema.default('ACTIVE'),
});
export type TeacherListQuery = z.infer<typeof TeacherListQuerySchema>;

export const TeacherListItemSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  subjects: z.array(z.string()),
  status: TeacherStatusSchema,
  access: TeacherAccessSchema,
  batchCount: z.number().int(),
});
export type TeacherListItem = z.infer<typeof TeacherListItemSchema>;
export const TeacherPageSchema = cursorPageSchema(TeacherListItemSchema);

export const TeacherSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  subjects: z.array(z.string()),
  status: TeacherStatusSchema,
  access: TeacherAccessSchema,
  /** For INVITED: when the link expires. */
  inviteExpiresAt: z.string().nullable(),
  version: z.number().int(),
  createdAt: z.string(),
  batches: z.array(z.object({ id: z.uuid(), name: z.string(), courseName: z.string() })),
});
export type Teacher = z.infer<typeof TeacherSchema>;

/**
 * `POST /teachers`: just a name (no sign-in), invite them by email as a member with the teacher
 * role (C-67), or link someone already on the team.
 */
export const CreateTeacherSchema = z
  .object({
    mode: z.enum(['name', 'invite', 'member']),
    fullName: PersonNameSchema.optional(),
    email: Email.optional(),
    membershipId: z.uuid().optional(),
    phone: PhoneSchema.optional(),
    subjects: Subjects.default([]),
  })
  .superRefine((t, ctx) => {
    if (t.mode !== 'member' && !t.fullName)
      ctx.addIssue({ code: 'custom', path: ['fullName'], message: 'required' });
    if (t.mode === 'invite' && !t.email)
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'required' });
    if (t.mode === 'member' && !t.membershipId)
      ctx.addIssue({ code: 'custom', path: ['membershipId'], message: 'required' });
  });
export type CreateTeacher = z.infer<typeof CreateTeacherSchema>;

export const UpdateTeacherSchema = z.object({
  version: z.number().int().min(1),
  fullName: PersonNameSchema.optional(),
  phone: PhoneSchema.nullable().optional(),
  subjects: Subjects.optional(),
  status: TeacherStatusSchema.optional(),
});
export type UpdateTeacher = z.infer<typeof UpdateTeacherSchema>;

/** Team members who aren't a teacher yet ("link someone on the team"). */
export const LinkableMemberListSchema = z.object({
  items: z.array(
    z.object({ membershipId: z.uuid(), name: z.string(), email: z.string().nullable() }),
  ),
});

// ── Search (command palette) ──────────────────────────────────────────────────────────────

export const SearchQuerySchema = z.object({ q: z.string().trim().min(2).max(60) });
/** Up to this many results per type (C-105). */
export const SEARCH_LIMIT_PER_TYPE = 5;
export const SearchResultsSchema = z.object({
  students: z.array(
    z.object({
      id: z.uuid(),
      fullName: z.string(),
      admissionNo: z.string(),
      status: StudentStatusSchema,
      archived: z.boolean(),
    }),
  ),
  parents: z.array(
    z.object({
      id: z.uuid(),
      fullName: z.string(),
      /** A child in the caller's scope, to open Student 360 on. */
      studentId: z.uuid().nullable(),
      studentName: z.string().nullable(),
    }),
  ),
  teachers: z.array(z.object({ id: z.uuid(), fullName: z.string() })),
});
export type SearchResults = z.infer<typeof SearchResultsSchema>;
