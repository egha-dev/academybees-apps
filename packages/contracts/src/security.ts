import { z } from 'zod';

import { TotpCodeSchema } from './auth.js';
import { StaffRoleKeySchema } from './roles.js';

/**
 * Account security on the academy host (G-11, C-80): optional 2FA, recovery codes, devices and
 * sessions, password change, and the academy's 2FA rule.
 */

const CurrentPassword = z.string().min(1).max(256);

/** `GET /auth/security` — the signed-in user's 2FA state in this academy. */
export const SecurityOverviewSchema = z.object({
  mfa: z.object({
    enabled: z.boolean(),
    enabledAt: z.iso.datetime().nullable(),
    recoveryCodesLeft: z.number().int(),
    /** This academy requires 2FA for one of the user's roles: it can't be turned off here. */
    required: z.boolean(),
    /** Owner/Accountant without 2FA: show the strong prompt (G-11). */
    recommended: z.boolean(),
  }),
  password: z.object({ updatedAt: z.iso.datetime().nullable() }),
});
export type SecurityOverview = z.infer<typeof SecurityOverviewSchema>;

/** Re-authentication for a sensitive change (start 2FA, turn it off, new recovery codes). */
export const ReauthRequestSchema = z.object({ password: CurrentPassword });

export const MfaSetupConfirmRequestSchema = z.object({ code: TotpCodeSchema });

/** Ten recovery codes, shown once. */
export const RecoveryCodesResponseSchema = z.object({
  recoveryCodes: z.array(z.string()).length(10),
});
export type RecoveryCodesResponse = z.infer<typeof RecoveryCodesResponseSchema>;

export const ChangePasswordRequestSchema = z.object({
  currentPassword: CurrentPassword,
  newPassword: z.string().min(1).max(256),
});

/**
 * One signed-in device in this academy. `device` is a code such as `chrome/android` that the web
 * translates; no location and no IP are shown (G-11).
 */
export const DeviceSessionSchema = z.object({
  id: z.uuid(),
  device: z.string(),
  signedInAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime(),
  current: z.boolean(),
});
export type DeviceSession = z.infer<typeof DeviceSessionSchema>;

export const DeviceSessionListSchema = z.object({ items: z.array(DeviceSessionSchema) });
export type DeviceSessionList = z.infer<typeof DeviceSessionListSchema>;

export const RevokedCountSchema = z.object({ revoked: z.number().int() });

/** `tenant_settings.security` (PRD v3.2 G-11): staff roles that must use 2FA here. */
export const SecuritySettingsSchema = z.object({
  requireMfaForRoles: z.array(StaffRoleKeySchema).max(5).default([]),
});
export type SecuritySettings = z.infer<typeof SecuritySettingsSchema>;

export const SecuritySettingsResponseSchema = z.object({
  requireMfaForRoles: z.array(StaffRoleKeySchema),
  version: z.number().int(),
});
export type SecuritySettingsResponse = z.infer<typeof SecuritySettingsResponseSchema>;

export const UpdateSecuritySettingsSchema = z.object({
  version: z.number().int().min(1),
  requireMfaForRoles: z
    .array(StaffRoleKeySchema)
    .max(5)
    .refine((roles) => new Set(roles).size === roles.length, { message: 'Duplicate role' }),
});
export type UpdateSecuritySettings = z.infer<typeof UpdateSecuritySettingsSchema>;

/** The roles G-11 strongly prompts to turn on 2FA (they handle money). */
export const MFA_RECOMMENDED_ROLES = ['owner', 'accountant'] as const;
