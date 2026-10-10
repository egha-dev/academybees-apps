import { z } from 'zod';

import { ACADEMY_TYPES } from '../academy-types.js';
import { PLAN_KEYS } from '../plans.js';
import { defineAnalyticsEvent } from './registry.js';

/** Phase 0: one system event proves the pipeline end to end. Domain events arrive with their phases. */
export const ANALYTICS_EVENTS = {
  'system.service_started': defineAnalyticsEvent({
    name: 'system.service_started',
    version: 1,
    description: 'An API or worker process finished booting.',
    properties: z.strictObject({
      service: z.enum(['api', 'worker']),
      appEnv: z.enum(['local', 'ci', 'staging', 'production']),
    }),
  }),
  'team.invitation_sent': defineAnalyticsEvent({
    name: 'team.invitation_sent',
    version: 1,
    description: 'A staff member invited someone to the academy team.',
    properties: z.strictObject({
      roles: z.array(z.enum(['owner', 'admin', 'teacher', 'accountant', 'receptionist'])),
      resend: z.boolean(),
    }),
  }),
  'team.invitation_accepted': defineAnalyticsEvent({
    name: 'team.invitation_accepted',
    version: 1,
    description: 'An invited person joined the academy team.',
    properties: z.strictObject({ newAccount: z.boolean() }),
  }),
  'auth.password_reset': defineAnalyticsEvent({
    name: 'auth.password_reset',
    version: 1,
    description: 'A user chose a new password from a reset link.',
    properties: z.strictObject({}),
  }),
  'auth.mfa_enabled': defineAnalyticsEvent({
    name: 'auth.mfa_enabled',
    version: 1,
    description: 'An academy user turned on two-step sign-in.',
    properties: z.strictObject({
      /** Set up from the sign-in step because the academy requires it. */
      required: z.boolean(),
    }),
  }),
  'auth.mfa_disabled': defineAnalyticsEvent({
    name: 'auth.mfa_disabled',
    version: 1,
    description: 'An academy user turned off two-step sign-in.',
    properties: z.strictObject({}),
  }),
  'auth.password_changed': defineAnalyticsEvent({
    name: 'auth.password_changed',
    version: 1,
    description: 'A signed-in user changed their password.',
    properties: z.strictObject({}),
  }),
  'academy.mfa_rule_changed': defineAnalyticsEvent({
    name: 'academy.mfa_rule_changed',
    version: 1,
    description: 'An academy changed which staff roles must use two-step sign-in.',
    properties: z.strictObject({
      roles: z.array(z.enum(['owner', 'admin', 'teacher', 'accountant', 'receptionist'])),
    }),
  }),
  'legal.accepted': defineAnalyticsEvent({
    name: 'legal.accepted',
    version: 1,
    description: 'A user accepted the current legal documents (owner before onboarding, G-06).',
    properties: z.strictObject({
      kinds: z.array(z.enum(['TERMS', 'PRIVACY', 'DPA', 'ACADEMY_PRIVACY_TEMPLATE'])),
    }),
  }),
  'academy.provisioned': defineAnalyticsEvent({
    name: 'academy.provisioned',
    version: 1,
    description: 'Platform staff created an academy in the console (C-02).',
    properties: z.strictObject({
      academyType: z.enum(ACADEMY_TYPES),
      planKey: z.enum(PLAN_KEYS),
    }),
  }),
  'academy.status_changed': defineAnalyticsEvent({
    name: 'academy.status_changed',
    version: 1,
    description: 'Platform staff suspended, reactivated, activated or archived an academy (C-87).',
    properties: z.strictObject({
      action: z.enum(['suspend', 'reactivate', 'activate', 'archive']),
    }),
  }),
  'academy.subdomain_changed': defineAnalyticsEvent({
    name: 'academy.subdomain_changed',
    version: 1,
    description: "Platform staff changed an academy's subdomain; the old one redirects.",
    properties: z.strictObject({}),
  }),
  'onboarding.step_completed': defineAnalyticsEvent({
    name: 'onboarding.step_completed',
    version: 1,
    description: 'An academy owner saved or skipped a guided-setup step (UX v1.1 §5).',
    properties: z.strictObject({
      step: z.enum(['profile', 'type', 'course', 'teacher', 'batch', 'students', 'timetable']),
      skipped: z.boolean(),
    }),
  }),
  'onboarding.completed': defineAnalyticsEvent({
    name: 'onboarding.completed',
    version: 1,
    description: 'An academy finished the guided setup and opened (C-87).',
    properties: z.strictObject({ skippedSteps: z.number().int().min(0).max(7) }),
  }),
  'student.created': defineAnalyticsEvent({
    name: 'student.created',
    version: 1,
    description: 'Students were added to an academy.',
    properties: z.strictObject({
      source: z.enum(['onboarding', 'manual', 'import']),
      count: z.number().int().min(1),
    }),
  }),
  'student.status_changed': defineAnalyticsEvent({
    name: 'student.status_changed',
    version: 1,
    description: 'A student was put on hold, completed, left or made active again (G-27).',
    properties: z.strictObject({ to: z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'LEFT']) }),
  }),
  'student.archived': defineAnalyticsEvent({
    name: 'student.archived',
    version: 1,
    description: 'A student was archived (restorable for 90 days, C-108).',
    properties: z.strictObject({}),
  }),
  'student.restored': defineAnalyticsEvent({
    name: 'student.restored',
    version: 1,
    description: 'An archived student was restored (G-26).',
    properties: z.strictObject({}),
  }),
  'parent.linked': defineAnalyticsEvent({
    name: 'parent.linked',
    version: 1,
    description: 'A parent was linked to a student; `existing` when an existing parent was reused.',
    properties: z.strictObject({ existing: z.boolean() }),
  }),
  'consent.recorded': defineAnalyticsEvent({
    name: 'consent.recorded',
    version: 1,
    description: "A parent's consent was recorded or withdrawn (G-06).",
    properties: z.strictObject({
      channel: z.enum(['FAMILY_HUB', 'ACADEMY_STAFF', 'PAPER']),
      action: z.enum(['GRANT', 'WITHDRAW']),
    }),
  }),
  'teacher.created': defineAnalyticsEvent({
    name: 'teacher.created',
    version: 1,
    description: 'A teacher was added: by name only, invited by email, or linked from the team.',
    properties: z.strictObject({ mode: z.enum(['name', 'invite', 'member', 'onboarding']) }),
  }),
  'parent.invited': defineAnalyticsEvent({
    name: 'parent.invited',
    version: 1,
    description: 'A parent was invited to the Family Hub by the academy (C-102).',
    properties: z.strictObject({ resend: z.boolean() }),
  }),
  'parent.hub_linked': defineAnalyticsEvent({
    name: 'parent.hub_linked',
    version: 1,
    description: 'A parent linked their hub account to the academy with a code (C-107).',
    properties: z.strictObject({ method: z.enum(['QR', 'URL']) }),
  }),
  'family.join_requested': defineAnalyticsEvent({
    name: 'family.join_requested',
    version: 1,
    description: 'A parent asked to join from the Family Hub (G-31).',
    properties: z.strictObject({}),
  }),
  'family.join_decided': defineAnalyticsEvent({
    name: 'family.join_decided',
    version: 1,
    description: 'Staff approved or rejected a join request.',
    properties: z.strictObject({ decision: z.enum(['APPROVED', 'REJECTED']) }),
  }),
  'batch.created': defineAnalyticsEvent({
    name: 'batch.created',
    version: 1,
    description: 'A batch (class, group) was created.',
    properties: z.strictObject({ source: z.enum(['onboarding']) }),
  }),
  'session.generated': defineAnalyticsEvent({
    name: 'session.generated',
    version: 1,
    description: 'Class sessions were generated from weekly slots (ADR-024).',
    properties: z.strictObject({
      source: z.enum(['onboarding']),
      count: z.number().int().min(0),
    }),
  }),
} as const;

export type AnalyticsEventName = keyof typeof ANALYTICS_EVENTS;

export type AnalyticsEventProperties<N extends AnalyticsEventName> = z.infer<
  (typeof ANALYTICS_EVENTS)[N]['properties']
>;

export function isAnalyticsEventName(name: string): name is AnalyticsEventName {
  return Object.hasOwn(ANALYTICS_EVENTS, name);
}

/** Validate properties for a registered event. Unknown keys are rejected (strict objects). */
export function parseAnalyticsEvent<N extends AnalyticsEventName>(
  name: N,
  properties: unknown,
): AnalyticsEventProperties<N> {
  return ANALYTICS_EVENTS[name].properties.parse(properties) as AnalyticsEventProperties<N>;
}
