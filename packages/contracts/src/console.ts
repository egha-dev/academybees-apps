import { z } from 'zod';

import { AcademyTypeSchema } from './academy-types.js';
import { cursorPageSchema } from './pagination.js';
import { PlanKeySchema } from './plans.js';
import { TenantStatusSchema } from './tenant.js';

/**
 * Provisioning console (C-02, UX v1.1 §2–3, §9): academies list, Create Academy with live
 * subdomain availability, provisioning success, academy detail (overview + domain), status
 * changes and subdomain changes. Platform staff only, on the console host.
 */

const Email = z.string().trim().toLowerCase().max(320).pipe(z.email());
/** Academy and person names: any script (ADR-040); the API normalises (NFC) and checks letters. */
const Name = z.string().trim().min(2).max(120);
const SlugInput = z.string().trim().toLowerCase().min(1).max(63);

/** `GET /platform/slug-availability?slug=` — live feedback while typing (C-88). */
export const SlugAvailabilityQuerySchema = z.object({ slug: SlugInput });
export const SLUG_AVAILABILITY = ['available', 'taken', 'reserved', 'invalid'] as const;
export const SlugAvailabilitySchema = z.object({
  slug: z.string(),
  status: z.enum(SLUG_AVAILABILITY),
  /** For `invalid`: empty | too_short | too_long | format | double_hyphen. */
  problem: z.string().optional(),
  /** Free alternatives (up to 3) when the slug is taken or reserved. */
  suggestions: z.array(z.string()),
});
export type SlugAvailability = z.infer<typeof SlugAvailabilitySchema>;

/** `POST /platform/tenants` (Idempotency-Key required). */
export const CreateAcademySchema = z.object({
  name: Name,
  academyType: AcademyTypeSchema,
  slug: SlugInput,
  owner: z.object({ name: Name, email: Email }),
  planKey: PlanKeySchema.default('trial'),
  /** The first branch's name; "Main branch" when omitted. */
  branchName: z.string().trim().min(2).max(120).optional(),
});
export type CreateAcademy = z.infer<typeof CreateAcademySchema>;

export const OWNER_INVITE_STATUSES = ['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED', 'NONE'] as const;
export const ONBOARDING_STEPS = [
  'profile',
  'type',
  'course',
  'teacher',
  'batch',
  'students',
  'timetable',
  'ready',
] as const;
export const OnboardingStepSchema = z.enum(ONBOARDING_STEPS);
export type OnboardingStep = z.infer<typeof OnboardingStepSchema>;

export const AcademySummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  /** Full host of the academy, e.g. `gurushethra.academybees.com`. */
  host: z.string(),
  academyType: z.string(),
  status: TenantStatusSchema,
  planKey: z.string().nullable(),
  onboardingCompleted: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type AcademySummary = z.infer<typeof AcademySummarySchema>;

export const AcademyListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(512).optional(),
  /** Name or subdomain contains. */
  q: z.string().trim().max(80).optional(),
  status: TenantStatusSchema.optional(),
});
export const AcademyPageSchema = cursorPageSchema(AcademySummarySchema);

export const AcademyDetailSchema = AcademySummarySchema.extend({
  previousStatus: TenantStatusSchema.nullable(),
  statusReason: z.string().nullable(),
  statusChangedAt: z.iso.datetime().nullable(),
  plan: z
    .object({
      key: z.string(),
      name: z.string(),
      status: z.enum(['TRIAL']),
      trialEndsAt: z.iso.datetime().nullable(),
    })
    .nullable(),
  owner: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    invitation: z.object({
      status: z.enum(OWNER_INVITE_STATUSES),
      sentAt: z.iso.datetime().nullable(),
      expiresAt: z.iso.datetime().nullable(),
    }),
  }),
  onboarding: z.object({
    currentStep: z.string().nullable(),
    completedSteps: z.number().int(),
    totalSteps: z.number().int(),
    completedAt: z.iso.datetime().nullable(),
  }),
  domains: z.array(
    z.object({
      host: z.string(),
      role: z.enum(['PRIMARY', 'REDIRECT', 'ALIAS']),
      kind: z.enum(['SUBDOMAIN', 'CUSTOM']),
      createdAt: z.iso.datetime(),
    }),
  ),
});
export type AcademyDetail = z.infer<typeof AcademyDetailSchema>;

/** Suspend, reactivate, activate, archive: a reason is always recorded (C-87). */
export const TenantStatusChangeSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export type TenantStatusChange = z.infer<typeof TenantStatusChangeSchema>;

export const TENANT_TRANSITIONS = ['suspend', 'reactivate', 'activate', 'archive'] as const;
export type TenantTransition = (typeof TENANT_TRANSITIONS)[number];

/**
 * The academy lifecycle (C-11, C-87): which statuses each console action accepts and where it
 * goes. Reactivate restores the status before suspension.
 */
export function nextTenantStatus(
  action: TenantTransition,
  current: z.infer<typeof TenantStatusSchema>,
  previous: z.infer<typeof TenantStatusSchema> | null,
): z.infer<typeof TenantStatusSchema> | null {
  switch (action) {
    case 'suspend':
      return current === 'SETUP' || current === 'ACTIVE' ? 'SUSPENDED' : null;
    case 'reactivate':
      return current === 'SUSPENDED'
        ? previous === 'SETUP' || previous === 'ACTIVE'
          ? previous
          : 'ACTIVE'
        : null;
    case 'activate':
      return current === 'SETUP' ? 'ACTIVE' : null;
    case 'archive':
      return current === 'ARCHIVED' ? null : 'ARCHIVED';
  }
}

/** `POST /platform/tenants/:id/domains` — new primary subdomain; the old one redirects. */
export const ChangeSubdomainSchema = z.object({ slug: SlugInput });
export type ChangeSubdomain = z.infer<typeof ChangeSubdomainSchema>;
