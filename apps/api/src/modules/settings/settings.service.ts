import {
  type SecuritySettingsResponse,
  SecuritySettingsSchema,
  type UpdateSecuritySettings,
} from '@academybee/contracts';
import type { TenantBoundClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { AnalyticsService } from '../../core/analytics/analytics.service.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { MfaService } from '../../core/auth/mfa.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';

/**
 * Academy settings (PRD v3.1 §D). Phase 2 has only the 2FA rule (G-11, C-80); the rest of the
 * settings arrive with onboarding (Phase 3). Each section is a JSON column validated by its
 * contract schema, versioned with the row.
 */
@Injectable()
export class SettingsService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly mfa: MfaService,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
  ) {}

  async security(): Promise<SecuritySettingsResponse> {
    const row = await this.db.tenantSettings.findFirst({
      select: { security: true, version: true },
    });
    if (!row) throw new DomainError('NOT_FOUND', 'settings missing');
    const parsed = SecuritySettingsSchema.safeParse(row.security);
    return {
      requireMfaForRoles: parsed.success ? parsed.data.requireMfaForRoles : [],
      version: row.version,
    };
  }

  /**
   * Change which staff roles must use 2FA. Whoever turns the rule on for one of their own roles
   * must already use 2FA, so nobody locks themselves into a forced set-up by surprise. Members
   * already signed in without 2FA are asked to sign in again at their next token refresh.
   */
  async updateSecurity(change: UpdateSecuritySettings): Promise<SecuritySettingsResponse> {
    const userId = this.cls.get('userId');
    const roles = this.cls.get('membership')?.roles ?? [];
    if (!userId) throw new DomainError('UNAUTHENTICATED');
    const next = [...new Set(change.requireMfaForRoles)].sort();
    const before = await this.security();
    if (before.version !== change.version) throw new DomainError('VERSION_CONFLICT');
    if (next.join() === [...before.requireMfaForRoles].sort().join()) return before;
    if (roles.some((r) => (next as string[]).includes(r)) && !(await this.mfa.isEnabled(userId)))
      throw new DomainError('CONFLICT', 'turn on 2FA first', [
        { path: 'requireMfaForRoles', issue: 'mfa_not_enabled' },
      ]);

    return this.db.$transaction(async (tx) => {
      const updated = await tx.tenantSettings.updateMany({
        where: { version: change.version },
        data: { security: { requireMfaForRoles: next }, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
      await this.audit.record(
        {
          action: 'academy.security_settings_changed',
          entityType: 'TenantSettings',
          before: { requireMfaForRoles: before.requireMfaForRoles },
          after: { requireMfaForRoles: next },
        },
        tx,
      );
      await this.analytics.track(tx, 'academy.mfa_rule_changed', { roles: next });
      return { requireMfaForRoles: next, version: change.version + 1 };
    });
  }
}
