import { z } from 'zod';

import { PhoneSchema } from './onboarding.js';
import { CursorPageQuerySchema, cursorPageSchema } from './pagination.js';
import { ConsentPurposeSchema, ParentRelationshipSchema, StudentStatusSchema } from './people.js';

/**
 * Students, parents, health notes, consent, custom fields and activity (Phase 4; G-05, G-06,
 * G-26, C-102…C-108). Requests are validated with these schemas in the API and the web, and
 * responses are shaped by them (never raw Prisma rows).
 */

/** Person names: any script (ADR-040), NFC-normalised, at least one letter. */
export const PersonNameSchema = z
  .string()
  .transform((v) => v.normalize('NFC').trim())
  .pipe(
    z
      .string()
      .min(1)
      .max(120)
      .refine((v) => /\p{L}/u.test(v), { message: 'letters' }),
  );
const OptionalName = (max: number) =>
  z
    .string()
    .transform((v) => v.normalize('NFC').trim())
    .pipe(z.string().max(max))
    .transform((v) => (v ? v : null));
const OptionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(320)
  .transform((v) => (v ? v : null))
  .pipe(z.email().nullable());
/** A calendar date `YYYY-MM-DD` (in the academy's timezone, ADR-011). */
export const CalendarDateSchema = z.iso.date();
const Version = z.number().int().min(1);

export const GENDERS = ['FEMALE', 'MALE', 'OTHER', 'PREFER_NOT_TO_SAY'] as const;
export const GenderSchema = z.enum(GENDERS);

export const StudentAddressSchema = z.object({
  line1: OptionalName(120),
  line2: OptionalName(120),
  city: OptionalName(80),
  state: OptionalName(80),
  postalCode: OptionalName(12),
});
export type StudentAddress = z.infer<typeof StudentAddressSchema>;

export const EmergencyContactSchema = z.object({
  name: PersonNameSchema,
  relationship: OptionalName(40),
  phone: PhoneSchema,
});
export type EmergencyContact = z.infer<typeof EmergencyContactSchema>;

/** Values keyed by custom field key; checked against the academy's definitions by the API. */
export const CustomFieldValuesSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  z.union([z.string().max(200), z.number(), z.null()]),
);
export type CustomFieldValues = z.infer<typeof CustomFieldValuesSchema>;

const Tags = z.array(z.string().trim().min(1).max(40)).max(10);

// ── Parents ─────────────────────────────────────────────────────────────────────────────────

export const ParentLinkSchema = z.object({
  linkId: z.uuid(),
  parentId: z.uuid(),
  fullName: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  relationship: ParentRelationshipSchema,
  isPrimaryContact: z.boolean(),
  pickupAuthorised: z.boolean(),
});
export type ParentLink = z.infer<typeof ParentLinkSchema>;

/** A new parent's details, as typed by staff. Phone or email helps dedupe (C-106). */
export const NewParentSchema = z.object({
  fullName: PersonNameSchema,
  phone: PhoneSchema.optional(),
  email: OptionalEmail.optional(),
  occupation: OptionalName(80).optional(),
});

const LinkFlags = z.object({
  relationship: ParentRelationshipSchema.default('GUARDIAN'),
  isPrimaryContact: z.boolean().default(false),
  pickupAuthorised: z.boolean().default(false),
});

/** `POST /students/:id/parents` — link an existing parent (`parentId`) or a new one (`parent`). */
export const LinkParentSchema = LinkFlags.extend({
  parentId: z.uuid().optional(),
  parent: NewParentSchema.optional(),
}).refine((l) => Boolean(l.parentId) !== Boolean(l.parent), {
  message: 'parentId or parent',
  path: ['parentId'],
});
export type LinkParent = z.infer<typeof LinkParentSchema>;

/** `PATCH /students/:id/parents/:linkId`. */
export const UpdateParentLinkSchema = z.object({
  relationship: ParentRelationshipSchema.optional(),
  isPrimaryContact: z.boolean().optional(),
  pickupAuthorised: z.boolean().optional(),
});

export const ParentChildSchema = z.object({
  studentId: z.uuid(),
  fullName: z.string(),
  admissionNo: z.string(),
  status: StudentStatusSchema,
  relationship: ParentRelationshipSchema,
});

/** `GET /parents/:id` — children are only those the caller may see (scope). */
export const ParentSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  occupation: z.string().nullable(),
  whatsappCapable: z.boolean(),
  version: z.number().int(),
  children: z.array(ParentChildSchema),
});
export type Parent = z.infer<typeof ParentSchema>;

/** `PATCH /parents/:id`. */
export const UpdateParentSchema = z.object({
  version: Version,
  fullName: PersonNameSchema.optional(),
  phone: PhoneSchema.nullable().optional(),
  email: OptionalEmail.optional(),
  occupation: OptionalName(80).optional(),
  /** Set only with the parent's opt-in (G-07). */
  whatsappCapable: z.boolean().optional(),
});

/** `GET /parents/duplicates?phone=|email=` — "Use existing" suggestions (C-106). */
export const ParentDuplicatesQuerySchema = z
  .object({ phone: PhoneSchema.optional(), email: OptionalEmail.optional() })
  .refine((q) => q.phone || q.email, { message: 'phone or email' });
export const ParentDuplicateSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  childrenCount: z.number().int(),
});
export const ParentDuplicateListSchema = z.object({ items: z.array(ParentDuplicateSchema) });

// ── Students ────────────────────────────────────────────────────────────────────────────────

export const StudentListQuerySchema = CursorPageQuerySchema.extend({
  /** Name (trigram), admission number or phone (C-105). */
  q: z.string().trim().min(2).max(60).optional(),
  status: StudentStatusSchema.optional(),
  batchId: z.uuid().optional(),
  courseId: z.uuid().optional(),
  /** Archived students instead of current ones (C-108). */
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type StudentListQuery = z.infer<typeof StudentListQuerySchema>;

export const StudentListItemSchema = z.object({
  id: z.uuid(),
  admissionNo: z.string(),
  fullName: z.string(),
  preferredName: z.string().nullable(),
  status: StudentStatusSchema,
  archivedAt: z.string().nullable(),
  primaryParent: z.object({ fullName: z.string(), phone: z.string().nullable() }).nullable(),
});
export type StudentListItem = z.infer<typeof StudentListItemSchema>;
export const StudentPageSchema = cursorPageSchema(StudentListItemSchema);

export const EnrolmentSummarySchema = z.object({
  batchId: z.uuid(),
  batchName: z.string(),
  courseName: z.string(),
  startedOn: z.string(),
});

/** `GET /students/:id` — never includes health notes (C-90). */
export const StudentSchema = z.object({
  id: z.uuid(),
  admissionNo: z.string(),
  fullName: z.string(),
  preferredName: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  gender: GenderSchema.nullable(),
  schoolName: z.string().nullable(),
  grade: z.string().nullable(),
  admissionDate: z.string(),
  address: StudentAddressSchema.nullable(),
  emergencyContact: EmergencyContactSchema.nullable(),
  tags: z.array(z.string()),
  customFields: CustomFieldValuesSchema,
  status: StudentStatusSchema,
  archivedAt: z.string().nullable(),
  /** Last day a restore is possible (90 days after archiving, C-108). */
  restorableUntil: z.string().nullable(),
  hasHealthNote: z.boolean(),
  version: z.number().int(),
  createdAt: z.string(),
  parents: z.array(ParentLinkSchema),
  enrolments: z.array(EnrolmentSummarySchema),
});
export type Student = z.infer<typeof StudentSchema>;

const StudentProfileFields = {
  preferredName: OptionalName(60).optional(),
  dateOfBirth: CalendarDateSchema.nullable().optional(),
  gender: GenderSchema.nullable().optional(),
  schoolName: OptionalName(120).optional(),
  grade: OptionalName(40).optional(),
  address: StudentAddressSchema.nullable().optional(),
  emergencyContact: EmergencyContactSchema.nullable().optional(),
  tags: Tags.optional(),
  customFields: CustomFieldValuesSchema.optional(),
};

/** `POST /students` (Add Student drawer, UX §11.3): minimum fields plus an optional parent. */
export const CreateStudentSchema = z.object({
  fullName: PersonNameSchema,
  ...StudentProfileFields,
  /** Defaults to today in the academy's timezone. */
  admissionDate: CalendarDateSchema.optional(),
  parent: LinkParentSchema.optional(),
});
export type CreateStudent = z.infer<typeof CreateStudentSchema>;

/** `PATCH /students/:id`. */
export const UpdateStudentSchema = z.object({
  version: Version,
  fullName: PersonNameSchema.optional(),
  admissionDate: CalendarDateSchema.optional(),
  ...StudentProfileFields,
});
export type UpdateStudent = z.infer<typeof UpdateStudentSchema>;

/** `POST /students/:id/status` (G-27): a reason is required; Undo sends the previous status. */
export const ChangeStudentStatusSchema = z.object({
  version: Version,
  status: StudentStatusSchema,
  reason: z.string().trim().min(1).max(300),
});

/** `POST /students/:id/archive` and `/restore` (C-108). */
export const ArchiveStudentSchema = z.object({
  version: Version,
  reason: z.string().trim().max(300).optional(),
});
export const RestoreStudentSchema = z.object({ version: Version });

/** Restore window after archiving (G-26, C-108). */
export const RESTORE_WINDOW_DAYS = 90;

// ── Health notes (G-05, C-90, C-104) ────────────────────────────────────────────────────────

/** `GET /students/:id/health-note` — `note: null` when none. Every read is audited. */
export const HealthNoteSchema = z.object({
  note: z
    .object({ notes: z.string(), version: z.number().int(), updatedAt: z.string() })
    .nullable(),
});
/** `PUT /students/:id/health-note` — `version` is required when a note exists. Empty clears. */
export const PutHealthNoteSchema = z.object({
  notes: z.string().trim().max(2000),
  version: Version.optional(),
});

// ── Consent (G-06, ADR-034, C-103) ─────────────────────────────────────────────────────────

export const CONSENT_ACTIONS = ['GRANT', 'WITHDRAW'] as const;
export const CONSENT_CHANNELS = ['FAMILY_HUB', 'ACADEMY_STAFF', 'PAPER'] as const;
export const ConsentRecordSchema = z.object({
  id: z.uuid(),
  parentId: z.uuid(),
  parentName: z.string(),
  action: z.enum(CONSENT_ACTIONS),
  purposes: z.array(ConsentPurposeSchema),
  noticeVersion: z.string(),
  channel: z.enum(CONSENT_CHANNELS),
  recordedAt: z.string(),
});
export const ConsentHistorySchema = z.object({ items: z.array(ConsentRecordSchema) });

/** `POST /students/:id/consents` — staff record a paper/in-person consent (never activates, C-103). */
export const RecordConsentSchema = z
  .object({
    parentId: z.uuid(),
    action: z.enum(CONSENT_ACTIONS),
    purposes: z.array(ConsentPurposeSchema).max(3).default([]),
    channel: z.enum(['ACADEMY_STAFF', 'PAPER']),
  })
  .refine((c) => c.action === 'WITHDRAW' || c.purposes.includes('service'), {
    message: 'service',
    path: ['purposes'],
  });

// ── Custom fields (G-05) ───────────────────────────────────────────────────────────────────

export const MAX_CUSTOM_FIELDS = 10;
export const CUSTOM_FIELD_TYPES = ['TEXT', 'NUMBER', 'DATE', 'SELECT'] as const;
export const CustomFieldTypeSchema = z.enum(CUSTOM_FIELD_TYPES);
const FieldLabel = z.string().trim().min(1).max(60);
const SelectOptions = z.array(FieldLabel).min(1).max(20);

export const CustomFieldSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  label: z.string(),
  type: CustomFieldTypeSchema,
  /** SELECT only: the labels to choose from (the stored value is the label's option key). */
  options: z.array(z.object({ value: z.string(), label: z.string() })),
  required: z.boolean(),
  sortOrder: z.number().int(),
  archived: z.boolean(),
});
export type CustomField = z.infer<typeof CustomFieldSchema>;
export const CustomFieldListSchema = z.object({ items: z.array(CustomFieldSchema) });

export const CreateCustomFieldSchema = z
  .object({
    label: FieldLabel,
    type: CustomFieldTypeSchema,
    options: SelectOptions.optional(),
    required: z.boolean().default(false),
  })
  .refine((f) => (f.type === 'SELECT') === Boolean(f.options), {
    message: 'options',
    path: ['options'],
  });
export const UpdateCustomFieldSchema = z.object({
  label: FieldLabel.optional(),
  options: SelectOptions.optional(),
  required: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100).optional(),
  archived: z.boolean().optional(),
});

// ── Activity (UX §9.3, ADR-027) ───────────────────────────────────────────────────────────

export const ACTIVITY_TYPES = [
  'student.created',
  'student.updated',
  'student.status_changed',
  'student.archived',
  'student.restored',
  'parent.linked',
  'parent.unlinked',
  'parent.updated',
  'consent.recorded',
  'health_note.updated',
] as const;
export const ActivityTypeSchema = z.enum(ACTIVITY_TYPES);
export type ActivityType = z.infer<typeof ActivityTypeSchema>;

export const ActivityEventSchema = z.object({
  id: z.uuid(),
  type: ActivityTypeSchema,
  at: z.string(),
  actorName: z.string().nullable(),
  /** Small, non-sensitive details for the timeline line (never health or contact data). */
  data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});
export const ActivityPageSchema = cursorPageSchema(ActivityEventSchema);
