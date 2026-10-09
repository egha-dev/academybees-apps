import {
  MFA_RECOMMENDED_ROLES,
  type RoleKey,
  SecuritySettingsSchema,
  type StaffRoleKey,
} from '@academybee/contracts';
import type { TenantBoundClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';

import { TENANT_DB } from '../database/database.module.js';

/**
 * The academy's 2FA rule (`tenant_settings.security.requireMfaForRoles`, G-11, C-80), read in the
 * current academy context. An unreadable or missing value means no rule (2FA stays optional).
 */
@Injectable()
export class MfaPolicyService {
  constructor(@Inject(TENANT_DB) private readonly db: TenantBoundClient) {}

  async requiredRoles(): Promise<StaffRoleKey[]> {
    const row = await this.db.tenantSettings.findFirst({ select: { security: true } });
    const parsed = SecuritySettingsSchema.safeParse(row?.security ?? {});
    return parsed.success ? parsed.data.requireMfaForRoles : [];
  }

  /** Does this academy require 2FA for any of these roles? */
  async isRequiredFor(roles: readonly RoleKey[]): Promise<boolean> {
    const required: readonly RoleKey[] = await this.requiredRoles();
    return roles.some((r) => required.includes(r));
  }
}

/** Owner/Accountant handle money: without 2FA they get the strong prompt (G-11). */
export function mfaRecommendedFor(roles: readonly RoleKey[]): boolean {
  return roles.some((r) => (MFA_RECOMMENDED_ROLES as readonly RoleKey[]).includes(r));
}
