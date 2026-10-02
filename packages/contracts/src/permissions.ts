import { z } from 'zod';

/**
 * Capability catalogue (ADR-008, ARCHITECTURE §7.1): the single source for API guards
 * (`@Can`), UI visibility and role seed data. Capabilities are `resource.action` strings.
 *
 * Complete for all modules, including ones built later, so role templates stay stable. Role
 * templates and their default scopes live in `roles.ts` (C-60).
 */
export const CAPABILITY_AREAS = {
  academy: [
    'academy.settings.read',
    'academy.settings.manage',
    'academy.branding.manage',
    'academy.domain.manage',
    'academy.onboarding.manage',
  ],
  team: ['team.read', 'team.invite', 'team.manage', 'role.manage'],
  people: [
    'student.read',
    'student.create',
    'student.update',
    'student.archive',
    'parent.read',
    'parent.manage',
    'teacher.read',
    'teacher.manage',
  ],
  scheduling: [
    'course.read',
    'course.manage',
    'batch.read',
    'batch.manage',
    'batch.enrol',
    'timetable.read',
    'timetable.manage',
    'session.manage',
  ],
  attendance: ['attendance.read', 'attendance.mark', 'attendance.edit_past'],
  finance: [
    'fee.read',
    'fee.manage',
    'invoice.read',
    'invoice.create',
    'invoice.issue',
    'invoice.cancel',
    'payment.read',
    'payment.record_cash',
    'payment.record_offline',
    'payment.verify',
    'payment.report',
    'payment.refund',
    'receipt.read',
    'finance.reconcile',
    /** Deferred module (OD-05); in the catalogue so roles are stable. */
    'expense.manage',
  ],
  crm: ['lead.read', 'lead.manage', 'trial.manage', 'admission.convert'],
  learning: [
    'homework.read',
    'homework.manage',
    'homework.submit',
    'assessment.read',
    'assessment.manage',
    'assessment.grade',
    'progress.read',
  ],
  communication: ['announcement.read', 'announcement.publish', 'message.send', 'template.manage'],
  insights: ['report.read', 'report.finance', 'report.export'],
  subscription: ['subscription.read', 'subscription.manage'],
  audit: ['audit.read'],
  platform: [
    'platform.tenant.read',
    'platform.tenant.create',
    'platform.tenant.suspend',
    'platform.tenant.domain',
    'platform.user.read',
    'platform.user.manage',
    'platform.plan.manage',
    'platform.billing.read',
    'platform.billing.manage',
    'platform.analytics.read',
    'platform.support.manage',
    'platform.announcement.publish',
    'platform.settings.manage',
    'platform.audit.read',
    'platform.impersonate',
  ],
} as const satisfies Record<string, readonly `${string}.${string}`[]>;

export type CapabilityArea = keyof typeof CAPABILITY_AREAS;
export type Capability = (typeof CAPABILITY_AREAS)[CapabilityArea][number];

export const CAPABILITIES: readonly Capability[] = Object.values(CAPABILITY_AREAS).flat();

const CAPABILITY_SET: ReadonlySet<string> = new Set(CAPABILITIES);

export function isCapability(value: string): value is Capability {
  return CAPABILITY_SET.has(value);
}

/** Platform capabilities are only ever granted to platform staff (console audience). */
export function isPlatformCapability(capability: Capability): boolean {
  return capability.startsWith('platform.');
}

export const CapabilitySchema = z.enum(CAPABILITIES as [Capability, ...Capability[]]);

/** Record scopes a capability is evaluated with (ARCHITECTURE §7.2). */
export const Scope = {
  TENANT: 'TENANT',
  BRANCH: 'BRANCH',
  ASSIGNED: 'ASSIGNED',
  LINKED: 'LINKED',
  SELF: 'SELF',
} as const;
export type Scope = (typeof Scope)[keyof typeof Scope];
export const ScopeSchema = z.enum(Scope);
