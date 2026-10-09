import {
  type AcademyDetail,
  type CreateAcademy,
  newId,
  startTrialSubscription,
  TERMINOLOGY_TEMPLATES,
} from '@academybee/contracts';
import { ensureSystemRoles } from '@academybee/database';
import { normalizeName, validateName } from '@academybee/i18n';
import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { AnalyticsService } from '../../core/analytics/analytics.service.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { type RequestContext } from '../../core/context/request-context.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { TenantResolver } from '../../core/tenant/tenant-resolver.service.js';
import { PlatformDb } from '../platform-db.js';
import { AcademiesService } from './academies.service.js';
import { OwnerInviteService } from './owner-invite.service.js';
import { SlugAvailabilityService } from './slug-availability.service.js';

const DEFAULT_BRANCH = 'Main branch';

/**
 * Create an academy (PRD v3.1 §B, C-02, C-89): one transaction that either creates everything or
 * nothing — the academy in SETUP, its primary subdomain, branding and settings with the type's
 * terminology (ADR-029), the default branch (C-07), the system roles (C-60), the owner's
 * invitation, the Trial subscription, the onboarding state, the audit row and, through the
 * outbox, the owner's invitation email. `@Idempotent` on the route makes retries safe; the
 * unique subdomain makes a race between two creators end with one academy (C-88).
 * Self-serve signup (Phase 13) reuses this service.
 */
@Injectable()
export class ProvisioningService {
  constructor(
    private readonly platform: PlatformDb,
    private readonly slugs: SlugAvailabilityService,
    private readonly academies: AcademiesService,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
    private readonly ownerInvites: OwnerInviteService,
    private readonly resolver: TenantResolver,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  async provision(input: CreateAcademy): Promise<AcademyDetail> {
    const name = academyName(input.name, 'name');
    const ownerName = personName(input.owner.name, 'owner.name');
    const branchName = input.branchName
      ? academyName(input.branchName, 'branchName')
      : DEFAULT_BRANCH;
    const staffId = this.cls.get('userId');

    const tenantId = newId();
    try {
      await this.platform.transaction(async (tx) => {
        const availability = await this.slugs.check(input.slug, tx);
        if (availability.status !== 'available')
          throw slugError(availability.status, availability.suggestions, availability.problem);
        const slug = availability.slug;

        await tx.tenant.create({
          data: {
            id: tenantId,
            slug,
            name,
            academyType: input.academyType,
            status: 'SETUP',
            createdById: staffId ?? null,
          },
        });
        // A subdomain is ours by definition: verified from the start (PRD v3.1 §G is about CUSTOM).
        await tx.tenantDomain.create({
          data: {
            id: newId(),
            tenantId,
            hostname: slug,
            kind: 'SUBDOMAIN',
            role: 'PRIMARY',
            verification: 'VERIFIED',
            verifiedAt: new Date(),
          },
        });
        await tx.tenantBranding.create({ data: { tenantId, displayName: name } });
        await tx.tenantSettings.create({
          data: {
            tenantId,
            terminology: TERMINOLOGY_TEMPLATES[input.academyType],
            i18n: { defaultLocale: 'en-IN', enabledLocales: ['en-IN'], documentLocale: 'en-IN' },
          },
        });
        await tx.branch.create({
          data: { id: newId(), tenantId, name: branchName, isDefault: true },
        });
        await ensureSystemRoles(tx, tenantId, newId);
        await this.ownerInvites.send(tx, {
          tenantId,
          slug,
          academy: name,
          owner: { name: ownerName, email: input.owner.email },
        });
        await tx.subscription.create({
          data: { tenantId, ...startTrialSubscription(input.planKey, new Date()) },
        });
        await tx.tenantOnboarding.create({ data: { tenantId, currentStep: 'profile' } });

        await this.audit.record(
          {
            action: 'platform.tenant_provisioned',
            tenantId,
            entityType: 'Tenant',
            entityId: tenantId,
            after: { slug, name, academyType: input.academyType, planKey: input.planKey },
          },
          tx,
        );
        await this.analytics.track(
          tx,
          'academy.provisioned',
          { academyType: input.academyType, planKey: input.planKey },
          { tenantId },
        );
      });
    } catch (error) {
      // Two creators raced for the same subdomain: the database kept one (C-88).
      if (isUniqueViolation(error)) {
        const suggestions = await this.slugs.suggestions(input.slug.trim().toLowerCase());
        throw slugError('taken', suggestions);
      }
      throw error;
    }
    // An earlier "unknown host" answer for this subdomain must not linger (C-96).
    await this.resolver.invalidateHost(input.slug.trim().toLowerCase());
    return this.academies.detail(tenantId, { audit: false });
  }
}

/** Academy and branch names: any script, NFC, at least one letter (ADR-040). */
function academyName(raw: string, path: string): string {
  const value = normalizeName(raw);
  if (!/\p{L}/u.test(value) || [...value].length > 120)
    throw new DomainError('VALIDATION_FAILED', 'bad name', [{ path, issue: 'invalid' }]);
  return value;
}

function personName(raw: string, path: string): string {
  const check = validateName(raw);
  if (!check.ok)
    throw new DomainError('VALIDATION_FAILED', 'bad name', [{ path, issue: check.issue }]);
  return check.value;
}

/** `409 CONFLICT` for a used subdomain (with free suggestions), 400 for one that can't be used. */
function slugError(status: string, suggestions: string[], problem?: string): DomainError {
  if (status === 'taken')
    return new DomainError('CONFLICT', 'subdomain taken', [
      { path: 'slug', issue: 'taken' },
      ...suggestions.map((s) => ({ path: 'suggestions', issue: s })),
    ]);
  return new DomainError('VALIDATION_FAILED', `subdomain ${status}`, [
    { path: 'slug', issue: status === 'reserved' ? 'reserved' : (problem ?? 'invalid') },
  ]);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    ((error as { code?: string }).code === 'P2002' ||
      /unique constraint/i.test((error as { message?: string }).message ?? ''))
  );
}
