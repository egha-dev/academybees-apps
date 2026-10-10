import { z } from 'zod';

import { PhoneSchema } from './onboarding.js';
import { ConsentPurposeSchema, ParentRelationshipSchema } from './people.js';
import { PersonNameSchema } from './students.js';

/**
 * The academy side of the Family Hub (G-31, ADR-039) and parent consent (G-06): parent invites
 * (C-102), linking by a one-time code (C-107), join requests and the academy privacy notice.
 */

/** Parent invitations are valid 30 days (C-102): parents often act days later. */
export const PARENT_INVITATION_TTL_MS = 30 * 24 * 3600 * 1000;
/** Link codes (C-107): 6 digits, 10 minutes, 5 tries. */
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
export const LINK_CODE_MAX_ATTEMPTS = 5;

/** How a parent reaches the hub through this academy. */
export const PARENT_ACCESS = ['MEMBER', 'INVITED', 'NONE'] as const;
export const ParentAccessSchema = z.enum(PARENT_ACCESS);

export const ParentInviteSchema = z.object({
  access: ParentAccessSchema,
  /** INVITED: the address the link went to and when it expires. */
  email: z.string().nullable(),
  expiresAt: z.string().nullable(),
});

// ── Hub: link to an academy (C-107) ─────────────────────────────────────────────────────────

/** `POST /hub/academies/:slug/link/start` — always 202 with the same body (no enumeration). */
export const LinkStartSchema = z.object({ method: z.enum(['QR', 'URL']) });
export const LinkStartedSchema = z.object({ status: z.literal('sent_if_known') });

/** `POST /hub/academies/:slug/link/verify` — the code plus the parent's consent (G-06). */
export const LinkVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  purposes: z
    .array(ConsentPurposeSchema)
    .max(3)
    .refine((p) => p.includes('service'), { message: 'service' }),
});
export const LinkVerifiedSchema = z.object({ linked: z.literal(true), children: z.number().int() });

/** `POST /hub/academies/:slug/join-requests` — always 202. */
export const CreateJoinRequestSchema = z.object({
  parentName: PersonNameSchema,
  phone: PhoneSchema.optional(),
  childName: PersonNameSchema,
  message: z.string().trim().max(500).optional(),
});
export const JoinRequestReceivedSchema = z.object({ status: z.literal('received') });

// ── Academy: Join requests queue ──────────────────────────────────────────────────────────

export const JOIN_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export const JoinRequestSchema = z.object({
  id: z.uuid(),
  parentName: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  childName: z.string(),
  message: z.string().nullable(),
  status: z.enum(JOIN_REQUEST_STATUSES),
  createdAt: z.string(),
  reviewedAt: z.string().nullable(),
  /** Parents already at the academy with the same phone or email (C-106). */
  matches: z.array(z.object({ id: z.uuid(), fullName: z.string(), children: z.array(z.string()) })),
});
export type JoinRequest = z.infer<typeof JoinRequestSchema>;
export const JoinRequestListSchema = z.object({ items: z.array(JoinRequestSchema) });

/** Approve by linking the requester to these students, as an existing or a new parent. */
export const ApproveJoinRequestSchema = z.object({
  studentIds: z.array(z.uuid()).min(1).max(10),
  parentId: z.uuid().optional(),
  relationship: ParentRelationshipSchema.default('GUARDIAN'),
});
export const RejectJoinRequestSchema = z.object({ reason: z.string().trim().max(300).optional() });

// ── Academy privacy notice (G-06) ─────────────────────────────────────────────────────────

/** `GET /academy/privacy-notice` (public): what the generated notice is filled with. */
export const PrivacyNoticeSchema = z.object({
  academy: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  version: z.string(),
  publishedAt: z.string(),
});
export type PrivacyNotice = z.infer<typeof PrivacyNoticeSchema>;
