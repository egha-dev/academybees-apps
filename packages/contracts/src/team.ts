import { z } from 'zod';

import { ExperienceSchema, LoginResponseSchema } from './auth.js';
import { cursorPageSchema } from './pagination.js';
import { StaffRoleKeySchema } from './roles.js';

/** Team, invitations and password recovery (Phase 2, C-67). */

const Email = z.string().trim().toLowerCase().max(320).pipe(z.email());

/** A password the server will check against the policy (OD-04): length only here. */
const NewPassword = z.string().min(1).max(256);

export const RoleRefSchema = z.object({ key: z.string(), name: z.string() });

export const TeamMemberSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  status: z.enum(['INVITED', 'ACTIVE', 'DISABLED']),
  roles: z.array(RoleRefSchema),
  branchIds: z.array(z.uuid()),
  lastLoginAt: z.iso.datetime().nullable(),
  /** Send back with a change (optimistic concurrency). */
  version: z.number().int(),
  isYou: z.boolean(),
});
export type TeamMember = z.infer<typeof TeamMemberSchema>;

export const TeamMemberPageSchema = cursorPageSchema(TeamMemberSchema);

export const UpdateTeamMemberSchema = z
  .object({
    version: z.number().int().min(1),
    roles: z.array(StaffRoleKeySchema).min(1).max(5).optional(),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  })
  .refine((v) => v.roles !== undefined || v.status !== undefined, {
    message: 'Nothing to change',
  });
export type UpdateTeamMember = z.infer<typeof UpdateTeamMemberSchema>;

export const RoleSummarySchema = z.object({
  key: z.string(),
  name: z.string(),
  isSystem: z.boolean(),
  experience: ExperienceSchema.nullable(),
  /** The caller may grant this role (C-67). */
  grantable: z.boolean(),
});
export const RoleListSchema = z.object({ roles: z.array(RoleSummarySchema) });

export const CreateInvitationSchema = z.object({
  /** Email is required in Phase 2; phone invites arrive with OTP (C-65, Phase 10). */
  email: Email,
  roles: z.array(StaffRoleKeySchema).min(1).max(5),
});
export type CreateInvitation = z.infer<typeof CreateInvitationSchema>;

export const InvitationSchema = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  roles: z.array(z.string()),
  status: z.enum(['PENDING', 'EXPIRED']),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export const InvitationListSchema = z.object({ invitations: z.array(InvitationSchema) });

/** What the invite link shows before accepting (public; the token holder only). */
export const InvitationPreviewSchema = z.object({
  academy: z.object({ name: z.string() }),
  email: z.string().nullable(),
  roles: z.array(z.string()),
  /** The email already has an AcademyBee account: accept with its password. */
  accountExists: z.boolean(),
  expiresAt: z.iso.datetime(),
});

export const AcceptInvitationSchema = z.object({
  /** Required for a new account; ignored for an existing one. */
  name: z.string().trim().min(1).max(120).optional(),
  password: NewPassword,
});
export type AcceptInvitation = z.infer<typeof AcceptInvitationSchema>;
export const AcceptInvitationResponseSchema = LoginResponseSchema;

export const ForgotPasswordSchema = z.object({ email: Email });
export const ResetPasswordSchema = z.object({
  token: z.string().min(16).max(128),
  password: NewPassword,
});
