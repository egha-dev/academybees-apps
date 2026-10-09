import { z } from 'zod';

import type { Capability, Scope } from './permissions.js';

/** Widest first: when several roles grant a capability, the widest scope wins (ADR-008). */
const SCOPE_ORDER: readonly Scope[] = ['TENANT', 'BRANCH', 'ASSIGNED', 'LINKED', 'SELF'];

/**
 * System role templates (ADR-008, ARCHITECTURE §7.3). They live in code (C-60): each academy gets
 * its own `Role` rows copied from them — by seed now, by provisioning from Phase 3. A grant is a
 * capability with the scope it is evaluated in (ARCHITECTURE §7.2).
 */
export const ROLE_KEYS = [
  'owner',
  'admin',
  'teacher',
  'accountant',
  'receptionist',
  'parent',
  'student',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];
export const RoleKeySchema = z.enum(ROLE_KEYS);

/** Where a role works (ARCHITECTURE §10.2): academy Manage, Teacher PWA, or the Family Hub. */
export type Experience = 'manage' | 'teach' | 'hub';

export type RoleTemplate = {
  key: RoleKey;
  experience: Experience;
  grants: Readonly<Partial<Record<Capability, Scope>>>;
};

const grant = (scope: Scope, capabilities: readonly Capability[]) =>
  Object.fromEntries(capabilities.map((c) => [c, scope])) as Partial<Record<Capability, Scope>>;

const OWNER: Capability[] = [
  'academy.settings.read',
  'academy.settings.manage',
  'academy.branding.manage',
  'academy.domain.manage',
  'academy.onboarding.manage',
  'team.read',
  'team.invite',
  'team.manage',
  'role.manage',
  'student.read',
  'student.create',
  'student.update',
  'student.archive',
  'parent.read',
  'parent.manage',
  'teacher.read',
  'teacher.manage',
  'course.read',
  'course.manage',
  'batch.read',
  'batch.manage',
  'batch.enrol',
  'timetable.read',
  'timetable.manage',
  'session.manage',
  'attendance.read',
  'attendance.mark',
  'attendance.edit_past',
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
  'payment.refund',
  'receipt.read',
  'finance.reconcile',
  'expense.manage',
  'lead.read',
  'lead.manage',
  'trial.manage',
  'admission.convert',
  'homework.read',
  'homework.manage',
  'assessment.read',
  'assessment.manage',
  'assessment.grade',
  'progress.read',
  'announcement.read',
  'announcement.publish',
  'message.send',
  'template.manage',
  'report.read',
  'report.finance',
  'report.export',
  'subscription.read',
  'subscription.manage',
  'audit.read',
];

export const ROLE_TEMPLATES: Readonly<Record<RoleKey, RoleTemplate>> = {
  owner: { key: 'owner', experience: 'manage', grants: grant('TENANT', OWNER) },
  admin: {
    key: 'admin',
    experience: 'manage',
    grants: {
      ...grant('TENANT', ['academy.settings.read', 'team.read', 'team.invite', 'template.manage']),
      ...grant('BRANCH', [
        'student.read',
        'student.create',
        'student.update',
        'student.archive',
        'parent.read',
        'parent.manage',
        'teacher.read',
        'teacher.manage',
        'course.read',
        'course.manage',
        'batch.read',
        'batch.manage',
        'batch.enrol',
        'timetable.read',
        'timetable.manage',
        'session.manage',
        'attendance.read',
        'attendance.mark',
        'attendance.edit_past',
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
        'receipt.read',
        'lead.read',
        'lead.manage',
        'trial.manage',
        'admission.convert',
        'homework.read',
        'homework.manage',
        'assessment.read',
        'assessment.manage',
        'assessment.grade',
        'progress.read',
        'announcement.read',
        'announcement.publish',
        'message.send',
        'report.read',
        'report.export',
      ]),
    },
  },
  teacher: {
    key: 'teacher',
    experience: 'teach',
    grants: {
      ...grant('SELF', ['teacher.read']),
      ...grant('TENANT', ['announcement.read']),
      ...grant('ASSIGNED', [
        'student.read',
        'parent.read',
        'course.read',
        'batch.read',
        'timetable.read',
        'attendance.read',
        'attendance.mark',
        'homework.read',
        'homework.manage',
        'assessment.read',
        'assessment.manage',
        'assessment.grade',
        'progress.read',
        'announcement.publish',
        'message.send',
        'report.read',
      ]),
    },
  },
  accountant: {
    key: 'accountant',
    experience: 'manage',
    grants: {
      ...grant('TENANT', ['announcement.read', 'subscription.read']),
      ...grant('BRANCH', [
        'student.read',
        'parent.read',
        'course.read',
        'batch.read',
        'timetable.read',
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
        'payment.refund',
        'receipt.read',
        'finance.reconcile',
        'expense.manage',
        'message.send',
        'report.read',
        'report.finance',
        'report.export',
      ]),
    },
  },
  receptionist: {
    key: 'receptionist',
    experience: 'manage',
    grants: {
      ...grant('TENANT', ['announcement.read']),
      ...grant('BRANCH', [
        'student.read',
        'student.create',
        'student.update',
        'parent.read',
        'parent.manage',
        'teacher.read',
        'course.read',
        'batch.read',
        'timetable.read',
        'attendance.read',
        'fee.read',
        'invoice.read',
        'receipt.read',
        'lead.read',
        'lead.manage',
        'trial.manage',
        'admission.convert',
        'announcement.publish',
        'message.send',
        'report.read',
      ]),
    },
  },
  parent: {
    key: 'parent',
    experience: 'hub',
    grants: grant('LINKED', [
      'student.read',
      'course.read',
      'batch.read',
      'timetable.read',
      'attendance.read',
      'fee.read',
      'invoice.read',
      'payment.read',
      'payment.report',
      'receipt.read',
      'homework.read',
      'homework.submit',
      'assessment.read',
      'progress.read',
      'announcement.read',
    ]),
  },
  student: {
    key: 'student',
    experience: 'hub',
    grants: grant('SELF', [
      'student.read',
      'course.read',
      'batch.read',
      'timetable.read',
      'attendance.read',
      'homework.read',
      'homework.submit',
      'assessment.read',
      'progress.read',
      'announcement.read',
    ]),
  },
};

/** Platform staff roles (console audience only, C-02). */
export const PLATFORM_ROLE_GRANTS: Readonly<
  Record<'SUPER_ADMIN' | 'SUPPORT' | 'FINANCE_OPS', readonly Capability[]>
> = {
  SUPER_ADMIN: [
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
  SUPPORT: [
    'platform.tenant.read',
    'platform.user.read',
    'platform.support.manage',
    'platform.audit.read',
  ],
  FINANCE_OPS: [
    'platform.tenant.read',
    'platform.billing.read',
    'platform.billing.manage',
    'platform.plan.manage',
  ],
};

/** The experience a set of roles opens on (manage beats teach beats hub, ARCHITECTURE §10.2). */
export function primaryExperience(roles: readonly RoleKey[]): Experience | undefined {
  const experiences = new Set(roles.map((r) => ROLE_TEMPLATES[r].experience));
  return (['manage', 'teach', 'hub'] as const).find((e) => experiences.has(e));
}

/** Combine role grants (template or stored) into capability → widest scope. */
export function mergeGrants(
  grants: Iterable<{ capability: Capability; scope: Scope }>,
): Partial<Record<Capability, Scope>> {
  const out: Partial<Record<Capability, Scope>> = {};
  for (const { capability, scope } of grants) {
    const current = out[capability];
    if (current === undefined || SCOPE_ORDER.indexOf(scope) < SCOPE_ORDER.indexOf(current))
      out[capability] = scope;
  }
  return out;
}

/** Roles the Team screen can grant. Parents and students join through the Family Hub (G-31, Phase 4). */
export const STAFF_ROLE_KEYS = ['owner', 'admin', 'teacher', 'accountant', 'receptionist'] as const;
export type StaffRoleKey = (typeof STAFF_ROLE_KEYS)[number];
export const StaffRoleKeySchema = z.enum(STAFF_ROLE_KEYS);

/**
 * May someone grant (or take away) a role? No privilege escalation (C-67): only owners grant the
 * owner role; any other staff role only by someone who already holds every capability it grants.
 * So an admin can add admins, teachers and receptionists, while accountants (refunds, finance
 * reports) are added by an owner.
 */
export function canGrantRole(
  granter: { roles: readonly string[]; capabilities: Partial<Record<Capability, Scope>> },
  role: string,
): boolean {
  const parsed = StaffRoleKeySchema.safeParse(role);
  if (!parsed.success) return false;
  if (parsed.data === 'owner') return granter.roles.includes('owner');
  return Object.keys(ROLE_TEMPLATES[parsed.data].grants).every(
    (capability) => granter.capabilities[capability as Capability] !== undefined,
  );
}
