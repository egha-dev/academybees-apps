import { z } from 'zod';

import { CapabilitySchema, ScopeSchema } from './permissions.js';
import { RoleKeySchema } from './roles.js';

/** Sign-in with email or phone (C-65; a phone only once verified) and password (OD-04). */
export const LoginRequestSchema = z.object({
  identifier: z.string().trim().min(3).max(320),
  password: z.string().min(1).max(256),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const ExperienceSchema = z.enum(['manage', 'teach', 'hub']);
export type ExperienceName = z.infer<typeof ExperienceSchema>;

/** Where the signed-in user should go next. Never contains IDs of other academies. */
export const LoginResponseSchema = z.object({
  user: z.object({ name: z.string() }),
  experience: ExperienceSchema.optional(),
  redirectTo: z.string(),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const LogoutRequestSchema = z.object({
  /** Sign out of every device for this audience (G-11). */
  everywhere: z.boolean().optional(),
});

/** `GET /auth/me` — the signed-in user in the current host's context (ARCHITECTURE §6). */
export const MeResponseSchema = z.object({
  user: z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  audience: z.enum(['TENANT', 'CONSOLE', 'HUB']),
  academy: z
    .object({
      roles: z.array(RoleKeySchema),
      /** Capability → the widest scope any of the user's roles grants (ADR-008). */
      capabilities: z.partialRecord(CapabilitySchema, ScopeSchema),
      experiences: z.array(ExperienceSchema),
      primaryExperience: ExperienceSchema.optional(),
    })
    .optional(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;
