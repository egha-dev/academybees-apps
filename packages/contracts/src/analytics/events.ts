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
