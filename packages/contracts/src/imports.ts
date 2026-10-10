import { z } from 'zod';

/**
 * Importing students and parents from a spreadsheet (G-02, ADR-036, C-100, C-101): upload →
 * columns matched to fields → validated preview (plain-language issues per row) → commit in chunks
 * → error report. Re-uploading a corrected file adds only the rows that aren't there yet.
 */

/** Limits (C-101). */
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 2000;
export const IMPORT_CHUNK = 200;

/** Fields a column can fill. Custom fields are `custom:<key>`. */
export const IMPORT_FIELDS = [
  'fullName',
  'preferredName',
  'dateOfBirth',
  'gender',
  'schoolName',
  'grade',
  'admissionDate',
  'parentName',
  'parentPhone',
  'parentEmail',
  'parentRelationship',
  'batch',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number] | `custom:${string}`;
export const ImportFieldSchema = z.union([
  z.enum(IMPORT_FIELDS),
  z.string().regex(/^custom:[a-z][a-z0-9_]{0,39}$/) as z.ZodType<`custom:${string}`>,
]);

/** `{ field: column index }` — each field from at most one column. */
export const ImportMappingSchema = z.record(z.string(), z.number().int().min(0).max(199));
export type ImportMapping = Partial<Record<ImportField, number>>;

/** What can be wrong with a row (labels in `people.import.issue.*`). */
export const IMPORT_ISSUES = [
  'required',
  'too_long',
  'invalid_date',
  'invalid_phone',
  'invalid_email',
  'invalid_gender',
  'invalid_relationship',
  'invalid_value',
  'unknown_batch',
  'duplicate_in_file',
] as const;
export type ImportIssue = (typeof IMPORT_ISSUES)[number];

/**
 * - `valid`: will be created;
 * - `error`: has issues, skipped;
 * - `exists`: the student is already at the academy (same name and date of birth, or same name
 *   and parent phone) — skipped, so a corrected file can be uploaded again (G-02);
 * - `created`: committed.
 */
export const IMPORT_ROW_STATUSES = ['valid', 'error', 'exists', 'created'] as const;
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

export const ImportRowSchema = z.object({
  n: z.number().int(),
  status: z.enum(IMPORT_ROW_STATUSES),
  name: z.string(),
  issues: z.array(z.object({ field: z.string(), issue: z.enum(IMPORT_ISSUES) })),
});
export type ImportRow = z.infer<typeof ImportRowSchema>;

export const IMPORT_JOB_STATUSES = [
  'UPLOADED',
  'VALIDATING',
  'PREVIEW_READY',
  'COMMITTING',
  'COMPLETED',
  'FAILED',
] as const;

export const ImportJobSchema = z.object({
  id: z.uuid(),
  status: z.enum(IMPORT_JOB_STATUSES),
  fileName: z.string(),
  headers: z.array(z.string()),
  mapping: ImportMappingSchema,
  totalRows: z.number().int(),
  validRows: z.number().int(),
  errorRows: z.number().int(),
  duplicateRows: z.number().int(),
  createdRows: z.number().int(),
  /** `file_unreadable` | `too_many_rows` | `empty` | `limit_reached` | `internal`. */
  failure: z.string().nullable(),
  version: z.number().int(),
  /** Up to 100 rows needing attention first (errors, then existing), for the preview. */
  preview: z.array(ImportRowSchema),
  /** Students the plan still allows (null = no limit). */
  seatsLeft: z.number().int().nullable(),
  createdAt: z.string(),
});
export type ImportJob = z.infer<typeof ImportJobSchema>;

/** `PUT /students/import/:id/mapping`. */
export const UpdateImportMappingSchema = z.object({
  version: z.number().int().min(1),
  mapping: ImportMappingSchema,
});

/** `POST /students/import/:id/commit`. */
export const CommitImportSchema = z.object({ version: z.number().int().min(1) });
