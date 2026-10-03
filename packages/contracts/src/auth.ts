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

/**
 * A parent/student signed in on an academy host: continue on the Family Hub with this one-time,
 * 60-second code (C-61). The browser goes to `app.…/auth/handoff?code=…`.
 */
export const LoginHandoffSchema = z.object({ handoff: z.object({ code: z.string() }) });

/**
 * Password accepted, second factor needed (C-66): `enrol` the first time (console), `verify`
 * after. `token` is a short-lived MFA token for `/auth/mfa/*`; no session exists yet.
 */
export const MfaStepSchema = z.enum(['enrol', 'verify']);
export const LoginMfaSchema = z.object({
  mfa: z.object({ step: MfaStepSchema, token: z.string() }),
});

/** `POST /auth/login`: signed in, hand off to the Family Hub, or a second factor first. */
export const LoginOutcomeSchema = z.union([
  LoginResponseSchema,
  LoginHandoffSchema,
  LoginMfaSchema,
]);
export type LoginOutcome = z.infer<typeof LoginOutcomeSchema>;

/** `POST /auth/handoff` on the Family Hub (C-61). */
export const HandoffRequestSchema = z.object({ code: z.string().min(20).max(100) });

const MfaTokenSchema = z.string().min(20).max(100);
const TotpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{3}\s?\d{3}$/);

export const MfaEnrolStartRequestSchema = z.object({ token: MfaTokenSchema });
/** The secret to add to an authenticator app: a QR code (SVG data URL) and the manual key. */
export const MfaEnrolStartResponseSchema = z.object({
  qrSvgDataUrl: z.string().startsWith('data:image/svg+xml'),
  manualKey: z.string(),
});
export type MfaEnrolStartResponse = z.infer<typeof MfaEnrolStartResponseSchema>;

export const MfaEnrolConfirmRequestSchema = z.object({
  token: MfaTokenSchema,
  code: TotpCodeSchema,
});
/** Enrolment done and signed in; the recovery codes are shown once and never again. */
export const MfaEnrolConfirmResponseSchema = LoginResponseSchema.extend({
  recoveryCodes: z.array(z.string()).length(10),
});
export type MfaEnrolConfirmResponse = z.infer<typeof MfaEnrolConfirmResponseSchema>;

/** Sign-in second step: a TOTP code or one recovery code. */
export const MfaVerifyRequestSchema = z
  .object({
    token: MfaTokenSchema,
    code: TotpCodeSchema.optional(),
    recoveryCode: z.string().trim().min(8).max(20).optional(),
  })
  .refine((v) => (v.code === undefined) !== (v.recoveryCode === undefined), {
    message: 'send either code or recoveryCode',
  });

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
  /**
   * HUB sessions: the academies where the user is an ACTIVE parent or student (ADR-039), read per
   * academy. Only what the user may see; never another user's academies.
   */
  hub: z
    .object({
      academies: z.array(
        z.object({ slug: z.string(), name: z.string(), roles: z.array(RoleKeySchema) }),
      ),
    })
    .optional(),
  /** CONSOLE sessions: the platform role (C-02). */
  platform: z.object({ role: z.enum(['SUPER_ADMIN', 'SUPPORT', 'FINANCE_OPS']) }).optional(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;
